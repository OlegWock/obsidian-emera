import { Plugin, TFile } from 'obsidian';
import { SettingTab } from './src/settings';
import { compileComponent, compileJsxIntoComponent, getComponentFiles } from './src/components';
import { Fragment as _Fragment, jsxs as _jsxs, jsx as _jsx } from 'react/jsx-runtime';
import { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import * as React from 'react';
import { EmeraContextProvider } from './src/context';
import { bundleFile } from './src/rollup';


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
    componentRegistry: Record<string, ComponentType<any>> = {};
    queue: QueueElement[] = [];
    isFilesLoaded = false;

    async onload() {
        // @ts-ignore Need this for JSX transformation to work
        window._emeraJsxRuntime = {
            jsx: _jsx,
            jsxs: _jsxs,
            Fragment: _Fragment,
        };

        // @ts-ignore Need this for complex JSX trees to work
        window._emeraComponentRegistry = this.componentRegistry;

        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));

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

            const bundledCode = bundleFile(this, indexFile);
            console.log('Bundled code', bundledCode);
            
            const files = getComponentFiles(this);
            console.log('Component files', files);
            const compiled = await Promise.all(files.map(f => compileComponent(this, f)));
            console.log('Compiled components', compiled);
            compiled.forEach(d => {
                this.componentRegistry[d.name] = d.component;
            });
            this.processQueue();
        });

        this.registerMarkdownPostProcessor(async (el, ctx) => {
            const codeblocks = Array.from(el.querySelectorAll<HTMLElement>('code'));
            console.log('markdown post', {el, ctx});
            for (const code of codeblocks) {
                console.log('Checking if need to replace codeblock', code);
                const emeraComponentIdentifier = code.className.includes('language-emera::') ? (/language-emera::(\w+)/gmi).exec(code.className)?.[1] : null;
                if (emeraComponentIdentifier) {
                    // Need to replace this code block
                    console.log('Requested component', emeraComponentIdentifier);
                    this.queue.push({ type: 'single', name: emeraComponentIdentifier, elementRef: new WeakRef(code), file: this.app.vault.getFileByPath(ctx.sourcePath)! });
                }
                if (code.classList.contains('language-emera')) {
                    console.log('Requested dynamic component');
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
                if (!this.componentRegistry[descriptor.name]) {
                    throw new Error(`Unknown component ${descriptor.name}`);
                }
                console.log('Rendering', descriptor, this.componentRegistry[descriptor.name]);
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
                        React.createElement(this.componentRegistry[descriptor.name], {}, src)
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

