import * as obsidian from 'obsidian';
import { EMERA_MODULES, EMERA_ROOT_SCOPE } from "./consts";
import type { EmeraPlugin } from "./plugin";
import { TFile } from 'obsidian';
import { safeCall } from './utils';

export class ScopeNode {
    public parent: ScopeNode | null = null;
    public children: ScopeNode[] = [];
    public scope: Record<string, any>;

    private descendantsMap: Record<string, ScopeNode> = {};
    private listeners: Set<VoidFunction> = new Set();
    private willInvokeListeners = false;
    private unblockPromiseWithResolvers: null | ReturnType<typeof Promise.withResolvers<void>> = null;

    constructor(public id: string) {
        this.reset();
    }

    get(prop: string): any {
        return this.scope[prop];
    }

    getAll(): Record<string, any> {
        return {
            ...(this.parent ? this.parent.getAll() : {}),
            ...this.scope,
        }
    }

    has(prop: string): boolean {
        if (Object.hasOwn(this.scope, prop)) return true;
        if (this.parent) return this.parent.has(prop);
        return false;
    }
  
    set(prop: string, val: any) {
        this.scope[prop] = val;
        this.scheduleOnChange();
    }

    setMany(mapping: Record<string, any>) {
        Object.assign(this.scope, mapping);
        this.scheduleOnChange();
    }

    onChange(cb: VoidFunction) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    get isBlocked(): boolean {
        if (this.parent) {
            return !!this.unblockPromiseWithResolvers || this.parent.isBlocked;    
        }
        return !!this.unblockPromiseWithResolvers;
    }

    block() {
        if (!this.unblockPromiseWithResolvers) {
            this.unblockPromiseWithResolvers = Promise.withResolvers<void>();
        }
    }

    unblock() {
        if (this.unblockPromiseWithResolvers) {
            this.unblockPromiseWithResolvers.resolve();
            this.unblockPromiseWithResolvers = null;
        }
    }

    waitForUnblock() {
        const blockedScope = this.findUp((scope) => !!scope.unblockPromiseWithResolvers);
        if (blockedScope) {
            return blockedScope.unblockPromiseWithResolvers!.promise;
        }
        return Promise.resolve();
    }

    private scheduleOnChange() {
        if (this.willInvokeListeners) return
        setTimeout(() => {
            this.willInvokeListeners = false;
            this.invokeListeners();
        }, 0);
        this.willInvokeListeners = true;
    }

    private invokeListeners() {
        this.listeners.forEach(safeCall);
        this.children.forEach(child => child.invokeListeners());
    }

    reset() {
        this.scope = new Proxy({}, {
            get: (target, prop: string, receiver) => {
                if (Object.hasOwn(target, prop)) {
                    return Reflect.get(target, prop, receiver);
                }
                if (this.parent) {
                    return this.parent.scope[prop];
                }
                throw new Error(`you're accessing '${prop}' but it isn't present in current scope`);
            },
        });
        this.scheduleOnChange();
    }

    addChild(child: ScopeNode) {
        if (child.parent) {
            throw new Error('scope is already in tree');
        }
        this.children.push(child);
        child.parent = this;
        this.addDescendant(child);
    }

    getDescendant(id: string): ScopeNode | undefined {
        if (id === this.id) return this;
        return this.descendantsMap[id];
    }

    private addDescendant(scope: ScopeNode) {
        this.descendantsMap[scope.id] = scope;
        this.parent?.addDescendant(scope);
    }

    private removeDescendant(scope: ScopeNode) {
        delete this.descendantsMap[scope.id];
        this.parent?.removeDescendant(scope);
    }

    dispose() {
        if (this.parent) {
            this.parent.children.splice(this.parent.children.indexOf(this));
            this.parent.removeDescendant(this);
        }
        this.children.forEach(child => child.dispose());
    }

    disposeDescendants() {
        this.children.forEach(child => child.dispose());
    }

    mapUp<T>(cb: (scope: ScopeNode) => T): T[] {
        let scope: ScopeNode | null = this;
        let results: T[] = [];
        do {
            results.push(cb(scope));
            scope = scope.parent;
        } while (scope);
        return results;
    }

    findUp(cb: (scope: ScopeNode) => boolean): ScopeNode | null {
        let scope: ScopeNode | null = this;
        do {
            if (cb(scope)) return scope;
            scope = scope.parent;
        } while (scope);
        return null;
    }

    mapDown<T>(cb: (scope: ScopeNode) => T): T[] {
        let results: T[] = [];
        results.push(cb(this));
        for (const scope of this.children) {
            results.push(...scope.mapDown(cb));
        }
        return results;
    }
}

export function getScope(name: 'root'): ScopeNode;
export function getScope(name: string): ScopeNode | undefined;
export function getScope(name: string): ScopeNode | undefined {
    return (window as any)[EMERA_ROOT_SCOPE].getDescendant(name);
}

export const populateRootScope = (plugin: EmeraPlugin) => {
    const scope = getScope('root');
    scope.reset();
    scope.set('app', plugin.app);
    scope.set('modules', (window as any)[EMERA_MODULES]);
};

export const getPageScope = (plugin: EmeraPlugin, file: TFile) => {
    const id = `page/${file.path}`;
    let scope = getScope(id);
    if (!scope) {
        scope = new ScopeNode(id);
        const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        scope.set('file', file);
        scope.set('frontmatter', frontmatter);

        plugin.app.metadataCache.on('changed', (changedFile, data) => {
            if (file.path === changedFile.path) {
                const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
                scope!.set('frontmatter', frontmatter);
                scope!.set('file', file);
            }
        });

        getScope('root').addChild(scope);
    }
    return scope;
}
