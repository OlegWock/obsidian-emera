import * as obsidian from 'obsidian';
import { EMERA_ROOT_SCOPE } from "./consts";
import type { EmeraPlugin } from "./plugin";
import { TFile } from 'obsidian';

export class ScopeNode {
    public parent: ScopeNode | null = null;
    public children: ScopeNode[] = [];
    public descendantsMap: Record<string, ScopeNode> = {};
    public scope: Record<string, any>;
    public listeners: Set<VoidFunction> = new Set();
    private willInvokeListeners = false;

    constructor(public id: string) {
        this.reset();
    }

    get(prop: string): any {
        return this.scope[prop];
    }

    set(prop: string, val: any) {
        this.scope[prop] = val;
        this.scheduleOnChange();
    }

    onChange(cb: VoidFunction) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
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
        this.listeners.forEach((cb) => {
            try { 
                cb();
            } catch (err) {
                console.error(err);
            }
        });
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

    mapUp<T>(cb: (scope: ScopeNode) => T): T[] {
        let scope: ScopeNode | null = this;
        let results: T[] = [];
        do {
            results.push(cb(scope));
            scope = this.parent;
        } while (scope);
        return results;
    }

    findUp(cb: (scope: ScopeNode) => boolean): ScopeNode | null {
        let scope: ScopeNode | null = this;
        do {
            if (cb(scope)) return scope;
            scope = this.parent;
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
    scope.set('obsidian', obsidian);
    scope.set('moment', obsidian.moment);
};

export const getPageScope = (plugin: EmeraPlugin, file: TFile) => {
    const id = `page/${file}`;
    let scope = getScope(id);
    if (!scope) {
        scope = new ScopeNode(id);
        const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        scope.set('file', file);
        scope.set('frontmatter', frontmatter);

        plugin.app.metadataCache.on('changed', (changedFile, data) => {
            if (file.path === changedFile.path) {
                console.log('File changed', file, data);
                const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
                // TODO: might want to compare old and new and don't re-render whole page in case 
                // user is just editing body of the note. Should be cheaper at least
                scope!.set('frontmatter', frontmatter);
                scope!.set('file', file);
            }
        });

        getScope('root').addChild(scope);
    }
    return scope;
}