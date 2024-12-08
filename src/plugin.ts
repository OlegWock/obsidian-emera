import { App, MarkdownView, Notice, Plugin, PluginManifest } from 'obsidian';
import { SettingTab } from './settings';
import { loadUserModule } from './bundler';
import { EMERA_ROOT_SCOPE } from './consts';
import { createEmeraStorage, EmeraStorage } from './emera-module/storage';
import { populateRootScope, ScopeNode } from './scope';
import { EmeraCodeProcessor } from './processors/code-processor';

interface PluginSettings {
    componentsFolder: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
    componentsFolder: 'Components'
};

export class EmeraPlugin extends Plugin {
    settings: PluginSettings;
    registeredShorthandsProcessors: string[] = [];
    isFilesLoaded = false;
    isComponentsLoaded: boolean;
    componentsLoadedPromise: Promise<void>;
    private resolveComponentsLoaded: VoidFunction;
    storage: EmeraStorage;
    rootScope: ScopeNode;

    codeProcessor: EmeraCodeProcessor;

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

        this.codeProcessor = new EmeraCodeProcessor(this);
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));
        this.storage = createEmeraStorage(this);

        this.registerMarkdownPostProcessor(this.codeProcessor.markdownPostProcessor);

        this.registerEditorExtension([
            this.codeProcessor.codemirrorStateField,
        ]);

        // TODO: when file is renamed, we should prompt user to change its references in any Emera code block


        this.app.workspace.onLayoutReady(async () => {
            this.isFilesLoaded = true;
            await this.storage.init();
            const registry = await loadUserModule(this);
            this.rootScope.setMany(registry);
            this.isComponentsLoaded = true;
            this.resolveComponentsLoaded();
            this.refreshEditors();
        });

        this.addCommand({
            id: 'refresh',
            name: 'Refresh user module',
            callback: async () => {
                await this.refreshUserModule();
                new Notice('User module was reloaded.');
            },
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

    refreshUserModule = async () => {
        const registry = await loadUserModule(this);
        this.rootScope.setMany(registry);
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

