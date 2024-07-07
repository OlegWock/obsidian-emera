import { App, MarkdownView, Plugin, PluginManifest } from 'obsidian';
import { SettingTab } from './settings';
import { ComponentType } from 'react';
import { loadComponents } from './bundler';
import { EMERA_COMPONENTS_REGISTRY, EMERA_ROOT_SCOPE } from './consts';
import { eventBus } from './events';
import { createEmeraStorage, EmeraStorage } from './emera-module/storage';
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

        // TODO: support shorthand syntax again

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
            this.refreshEditors();
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

