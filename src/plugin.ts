import { App, MarkdownView, Plugin, PluginManifest, TFile } from 'obsidian';
import { SettingTab } from './settings';
import { Fragment as _Fragment, jsxs as _jsxs, jsx as _jsx } from 'react/jsx-runtime';
import { ComponentType, createElement } from 'react';
import { compileJsxIntoComponent, loadComponents } from './bundler';
import { EMERA_COMPONENT_PREFIX, EMERA_COMPONENTS_REGISTRY, EMERA_INLINE_JS_PREFIX, EMERA_INLINE_JSX_PREFIX, EMERA_JSX_LANG_NAME, EMERA_ROOT_SCOPE } from './consts';
import { emeraEditorPlugin, registerCodemirrorMode } from './editor';
import { renderComponent } from './renderer';
import { eventBus } from './events';
import { ErrorAlert } from './components/ErrorBoundary';
import { createEmeraStorage, EmeraStorage } from './emera-module/storage';
import { EmptyBlock } from './components/EmptyBlock';
import { LoadingInline } from './components/LoadingInline';
import { populateRootScope, ScopeNode } from './scope';
import { InlineJsProcessor } from './processors/inline-js-processor';
import { InlineJsxProcessor } from './processors/inline-jsx-processor';
import { BlockJsxProcessor } from './processors/block-jsx-processor';
import { emeraCurrentEditorProviderPlugin, emeraCurrentEditorStateField } from './processors/utils';

interface PluginSettings {
    componentsFolder: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
    componentsFolder: 'Components'
};

export class EmeraPlugin extends Plugin {
    settings: PluginSettings;
    componentsRegistry: Record<string, ComponentType<any>> = {};
    registeredShorthandsProcessors: string[] = [];
    isFilesLoaded = false;
    isComponentsLoaded: boolean;
    componentsLoadedPromise: Promise<void>;
    private resolveComponentsLoaded: VoidFunction;
    storage: EmeraStorage;
    rootScope: ScopeNode;
    inlineJsProcessor: InlineJsProcessor;
    inlineJsxProcessor: InlineJsxProcessor;
    blockJsxProcessor: BlockJsxProcessor;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        const { resolve, promise } = Promise.withResolvers<void>();
        this.isComponentsLoaded = false;
        this.componentsLoadedPromise = promise;
        this.resolveComponentsLoaded = resolve;
        // @ts-ignore
        window.emera = this;

        this.rootScope = (window as any)[EMERA_ROOT_SCOPE];
        populateRootScope(this);

        this.inlineJsProcessor = new InlineJsProcessor(this);
        this.inlineJsxProcessor = new InlineJsxProcessor(this);
        this.blockJsxProcessor = new BlockJsxProcessor(this);
    }

    async onload() {
        this.componentsRegistry = (window as any)[EMERA_COMPONENTS_REGISTRY];

        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));
        this.storage = createEmeraStorage(this);

        // this.registerEditorExtension(emeraEditorPlugin(this));
        // this.attachMarkdownProcessors();

        this.registerMarkdownPostProcessor(this.inlineJsProcessor.markdownPostProcessor);
        this.registerMarkdownPostProcessor(this.inlineJsxProcessor.markdownPostProcessor);
        this.registerMarkdownPostProcessor(this.blockJsxProcessor.markdownPostProcessor);

        this.registerEditorExtension([
            emeraCurrentEditorProviderPlugin,
            emeraCurrentEditorStateField,
            this.inlineJsProcessor.codemirrorStateField,
            this.inlineJsxProcessor.codemirrorStateField,
            this.blockJsxProcessor.codemirrorStateField,
        ]);


        this.app.workspace.onLayoutReady(async () => {
            this.isFilesLoaded = true;
            await this.storage.init();
            const registry = await loadComponents(this);
            Object.assign(this.componentsRegistry, registry);
            this.isComponentsLoaded = true;
            this.resolveComponentsLoaded();
            eventBus.emit('onComponentsLoaded');
            // TODO: support namespaces
            Object.keys(this.componentsRegistry).forEach((name) => {
                this.attachShorthandNotationProcessor(name);
            });

            this.refreshEditors();
        });
    }

    attachShorthandNotationProcessor = (name: string) => {
        if (this.registeredShorthandsProcessors.includes(name)) {
            return;
        }
        registerCodemirrorMode(`${EMERA_COMPONENT_PREFIX}${name}`, 'markdown');
        this.registerMarkdownCodeBlockProcessor(`${EMERA_COMPONENT_PREFIX}${name}`, (src, container, ctx) => {
            const file = this.app.vault.getFileByPath(ctx.sourcePath)!;
            // TODO: support namespaces
            const component = this.componentsRegistry[name];
            const root = renderComponent({
                plugin: this,
                component,
                context: {
                    file,
                },
                container,
                children: src
            });

            eventBus.on('onComponentsReloaded', () => {
                renderComponent({
                    plugin: this,
                    component,
                    context: {
                        file,
                    },
                    container: root,
                    children: src
                });
            });
        });
        this.registeredShorthandsProcessors.push(name);
    }

    attachMarkdownProcessors = () => {
        this.registerMarkdownCodeBlockProcessor(EMERA_JSX_LANG_NAME, async (src, container, ctx) => {
            await this.componentsLoadedPromise;
            const file = this.app.vault.getFileByPath(ctx.sourcePath)!;
            let component: ComponentType<{}>;

            if (src.trim()) {
                try {
                    component = await compileJsxIntoComponent(src, this.rootScope);
                } catch (error) {
                    component = () => createElement(ErrorAlert, { error });
                }
            } else {
                component = EmptyBlock;
            }

            const root = renderComponent({
                plugin: this,
                component,
                context: {
                    file,
                },
                container,
            });
            eventBus.on('onComponentsReloaded', () => {
                console.log('Components reloaded, updating JSX block');
                renderComponent({
                    plugin: this,
                    component,
                    context: {
                        file,
                    },
                    container: root,
                });
            });
        });

        this.registerMarkdownPostProcessor((el, ctx) => {
            const file = this.app.vault.getFileByPath(ctx.sourcePath)!;
            const code = Array.from(el.querySelectorAll('code'));
            code.filter(el => el.parentElement!.tagName !== 'PRE').forEach(async (el) => {
                const nodeContent = el.textContent?.trim();
                if (!nodeContent) return;

                console.log('Processing inline code', el, nodeContent);

                // TODO: Probably want to cache this
                const span = document.createElement("span");
                if (nodeContent.startsWith(EMERA_INLINE_JS_PREFIX)) {
                    console.log('Detected inline JS');
                    const code = nodeContent.slice(EMERA_INLINE_JS_PREFIX.length);
                    span.classList.add('emera-inline-js');
                    let evaluated: any;
                    try {
                        evaluated = eval?.(code);
                    } catch (err) {
                        evaluated = `❗️${err.toString()}`;
                    }
                    span.textContent = evaluated;

                } else if (nodeContent.startsWith(EMERA_INLINE_JSX_PREFIX)) {
                    console.log('Detected inline JSX');
                    const code = nodeContent.slice(EMERA_INLINE_JSX_PREFIX.length);
                    const reactRoot = renderComponent({
                        component: LoadingInline,
                        container: span,
                        plugin: this,
                        context: {
                            file,
                        },
                    });

                    this.componentsLoadedPromise.then(() => compileJsxIntoComponent(code, this.rootScope)).then(component => {
                        renderComponent({
                            component,
                            container: reactRoot,
                            plugin: this,
                            context: {
                                file,
                            },
                        });

                        eventBus.on('onComponentsReloaded', () => {
                            renderComponent({
                                component,
                                container: reactRoot,
                                plugin: this,
                                context: {
                                    file,
                                },
                            });
                        });
                    });
                } else {
                    return;
                }

                el.replaceWith(span);
            });
        });
    }

    refreshEditors = () => {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view && leaf.view instanceof MarkdownView) {
                leaf.view.previewMode.rerender(true); 
                leaf.view.editor.refresh();
            }
        });

    }

    refreshComponents = async () => {
        const registry = await loadComponents(this);
        Object.assign(this.componentsRegistry, registry);
        // TODO: support namespaces
        Object.keys(this.componentsRegistry).forEach((name) => {
            this.attachShorthandNotationProcessor(name);
        });

        console.log('Emitting onComponentsReloaded');
        eventBus.emit('onComponentsReloaded');
        this.refreshEditors();
    }

    onunload() {
        this.storage.destroy();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

