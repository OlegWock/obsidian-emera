import { Plugin, TFile } from 'obsidian';
import { SettingTab } from './src/settings';
import { Fragment as _Fragment, jsxs as _jsxs, jsx as _jsx } from 'react/jsx-runtime';
import { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import * as React from 'react';
import { EmeraContextProvider } from './src/context';
import { bundleFile, importFromString, compileJsxIntoComponent } from './src/bundle';
import { EMERA_COMPONENTS_REGISTRY, EMERA_JSX_LANG_NAME, EMERA_MD_LANG_NAME } from './src/consts';
import './src/side-effects';


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

    async onload() {
        this.componentsRegistry = (window as any)[EMERA_COMPONENTS_REGISTRY];

        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));

        console.log('Plugin', this);
        // @ts-ignore
        window.emera = this;

        this.app.workspace.onLayoutReady(async () => {
            this.isFilesLoaded = true;

            const extensions = ['js', 'jsx', 'ts', 'tsx'];
            let indexFile: TFile | null = null;
            for (const ext of extensions) {
                indexFile = this.app.vault.getFileByPath(`${this.settings.componentsFolder}/index.${ext}`);
                if (indexFile) break;
            }
            if (!indexFile) {
                console.log('Index file not found');
                return;
            }

            const bundledCode = await bundleFile(this, indexFile);
            // console.log('Bundled code');
            // console.log(bundledCode);
            const registry = await importFromString(bundledCode);
            Object.assign(this.componentsRegistry, registry);
            this.processQueue();
        });

        this.registerMarkdownPostProcessor(async (el, ctx) => {
            const codeblocks = Array.from(el.querySelectorAll<HTMLElement>('code'));
            for (const code of codeblocks) {
                const emeraComponentIdentifier = code.className.includes(`language-${EMERA_MD_LANG_NAME}::`) ? (new RegExp(`language-${EMERA_MD_LANG_NAME}::(\\w+)`, 'gmi')).exec(code.className)?.[1] : null;
                if (emeraComponentIdentifier) {
                    // Need to replace this code block
                    this.queue.push({ type: 'single', name: emeraComponentIdentifier, elementRef: new WeakRef(code), file: this.app.vault.getFileByPath(ctx.sourcePath)! });
                }
                if (code.classList.contains(`language-${EMERA_JSX_LANG_NAME}`)) {
                    this.queue.push({ type: 'tree', elementRef: new WeakRef(code), file: this.app.vault.getFileByPath(ctx.sourcePath)! });
                }
            }
            if (this.isFilesLoaded) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        let i = 0;
        console.log('Attempting to process queque', this.queue);
        while (i < this.queue.length) {
            const descriptor = this.queue[i];
            const element = descriptor.elementRef.deref();
            if (!element) {
                this.queue.splice(i, 1);
            } else if (descriptor.type === 'single') {
                if (!this.componentsRegistry[descriptor.name]) {
                    throw new Error(`Unknown component ${descriptor.name}`);
                }
                console.log('Rendering', descriptor, this.componentsRegistry[descriptor.name]);
                const src = element.textContent;

                const container = document.createElement('div');
                container.classList.add('emera-root');
                element.parentElement!.replaceWith(container);
                const root = createRoot(container);
                root.render(
                    React.createElement(EmeraContextProvider, {
                        value: {
                            plugin: this,
                            file: descriptor.file,
                        }
                    },
                        React.createElement(this.componentsRegistry[descriptor.name], {}, src)
                    )
                );
                this.queue.splice(i, 1);
            } else if (descriptor.type === 'tree') {
                const src = element.textContent;
                console.log('Handling tree');
                console.log(src);
                if (src) {
                    const component = await compileJsxIntoComponent(src);
                    const container = document.createElement('div');
                    container.classList.add('emera-root');
                    element.parentElement!.replaceWith(container);
                    const root = createRoot(container);
                    root.render(
                        React.createElement(EmeraContextProvider, {
                            value: {
                                plugin: this,
                                file: descriptor.file,
                            }
                        },
                            React.createElement(component, {})
                        )
                    );
                }
                this.queue.splice(i, 1);
            } else {
                i++;
            }
        }
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

