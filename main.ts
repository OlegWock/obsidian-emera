import { App, Plugin, PluginManifest, TFile } from 'obsidian';
import { SettingTab } from './src/settings';
import { Fragment as _Fragment, jsxs as _jsxs, jsx as _jsx } from 'react/jsx-runtime';
import { ComponentType } from 'react';
import { compileJsxIntoComponent, loadComponents } from './src/bundle';
import { EMERA_COMPONENT_PREFIX, EMERA_COMPONENTS_REGISTRY, EMERA_JS_LANG_NAME, EMERA_JSX_LANG_NAME } from './src/consts';
import './src/side-effects';
import { emeraEditorPlugin, registerCodemirrorMode } from './src/codemirror';
import { renderComponent } from './src/renderer';


interface PluginSettings {
    componentsFolder: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
    componentsFolder: 'Components'
}

type QueueElement =
    | { type: 'single', name: string, elementRef: WeakRef<HTMLElement>, file: TFile }
    | { type: 'tree', elementRef: WeakRef<HTMLElement>, file: TFile }

export default class EmeraPlugin extends Plugin {
    settings: PluginSettings;
    componentsRegistry: Record<string, ComponentType<any>> = {};
    queue: QueueElement[] = [];
    isFilesLoaded = false;
    componentsLoaded: Promise<void>;
    private resolveComponentsLoaded: VoidFunction;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        const { resolve, reject, promise } = Promise.withResolvers<void>();
        this.componentsLoaded = promise;
        this.resolveComponentsLoaded = resolve;
    }

    async onload() {
        this.componentsRegistry = (window as any)[EMERA_COMPONENTS_REGISTRY];

        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));

        // @ts-ignore
        window.emera = this;

        this.registerEditorExtension(emeraEditorPlugin(this));

        this.app.workspace.onLayoutReady(async () => {
            this.isFilesLoaded = true;

            const registry = await loadComponents(this);
            Object.assign(this.componentsRegistry, registry);
            this.resolveComponentsLoaded();
            // TODO: we need to attach handlers right away in `onload` and then just re-render them once components are loaded
            // Otherwise, code components might remain unrendered until user does something to make Obsidian re-render blocks
            this.attachMarkdownProcessors();
        });
    }

    attachMarkdownProcessors() {
        Object.entries(this.componentsRegistry).forEach(([name, component]) => {
            registerCodemirrorMode(`${EMERA_COMPONENT_PREFIX}${name}`, 'markdown');
            this.registerMarkdownCodeBlockProcessor(`${EMERA_COMPONENT_PREFIX}${name}`, (src, container, ctx) => {
                const file = this.app.vault.getFileByPath(ctx.sourcePath)!;
                const root = renderComponent({
                    plugin: this,
                    component,
                    context: {
                        file,
                    },
                    container,
                    children: src
                });
            });
        });

        this.registerMarkdownCodeBlockProcessor(EMERA_JSX_LANG_NAME, async (src, container, ctx) => {
            const file = this.app.vault.getFileByPath(ctx.sourcePath)!;
            if (!src) {
                // TODO: render error?
                return;
            }
            const component = await compileJsxIntoComponent(src);
            const root = renderComponent({
                plugin: this,
                component,
                context: {
                    file,
                },
                container,
            });
        });

        this.registerMarkdownCodeBlockProcessor(EMERA_JS_LANG_NAME, async (src, container, ctx) => {
            console.log('Processing code block', src, ctx);
            // TODO: we need to know how many code blocks there is on page an which one of them is current one.
            // This doesn't seem possible with `registerMarkdownCodeBlockProcessor`, but we should be able to 
            // make our own CodeMirror extension which will replace emjs blocks

            // Algo:
            // Transpile code (no need for bundling)
            // Ensure it's executed in same order as defined on page
            // Store results of execution in special `scope` object (one per page)
            // We don't really to what script is evaluated, as we won't show its results directly
            // Render generic 'Emera code' in place of code block
            // Maybe allow user exporting string variable `emeraBlockName` which will be used in placeholder for easier navigation
            container.innerText = '[Emera code]';
        });
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

