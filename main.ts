import { Plugin, TFile } from 'obsidian';
import { SettingTab } from './src/settings';
import { Fragment as _Fragment, jsxs as _jsxs, jsx as _jsx } from 'react/jsx-runtime';
import { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import * as React from 'react';
import { EmeraContextProvider } from './src/context';
import { compileJsxIntoComponent, loadComponents } from './src/bundle';
import { EMERA_COMPONENT_PREFIX, EMERA_COMPONENTS_REGISTRY, EMERA_JSX_LANG_NAME } from './src/consts';
import './src/side-effects';
import { inlideCodePlugin, registerCodemirrorMode } from './src/codemirror';


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

        // @ts-ignore
        window.emera = this;

        this.registerEditorExtension(inlideCodePlugin);

        this.app.workspace.onLayoutReady(async () => {
            this.isFilesLoaded = true;

            const registry = await loadComponents(this);
            Object.assign(this.componentsRegistry, registry);
            this.attachMarkdownProcessors();
        });
    }

    attachMarkdownProcessors() {
        Object.entries(this.componentsRegistry).forEach(([name, component]) => {
            registerCodemirrorMode(`${EMERA_COMPONENT_PREFIX}${name}`, 'markdown');
            this.registerMarkdownCodeBlockProcessor(`${EMERA_COMPONENT_PREFIX}${name}`, (src, container, ctx) => {
                const file = this.app.vault.getFileByPath(ctx.sourcePath)!;
                container.classList.add('emera-root');
                const root = createRoot(container);
                root.render(
                    React.createElement(EmeraContextProvider, {
                        value: {
                            plugin: this,
                            file,
                        }
                    },
                        React.createElement(component, {}, src)
                    )
                );
            });
        });

        this.registerMarkdownCodeBlockProcessor(EMERA_JSX_LANG_NAME, async (src, container, ctx) => {
            const file = this.app.vault.getFileByPath(ctx.sourcePath)!;
            if (src) {
                const component = await compileJsxIntoComponent(src);
                container.classList.add('emera-root');
                const root = createRoot(container);
                root.render(
                    React.createElement(EmeraContextProvider, {
                        value: {
                            plugin: this,
                            file,
                        }
                    },
                        React.createElement(component, {})
                    )
                );
            }
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

