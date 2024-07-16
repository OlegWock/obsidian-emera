import type { EmeraPlugin } from "./plugin";
import { PluginSettingTab, App, Setting, Notice } from "obsidian";

export class SettingTab extends PluginSettingTab {
    plugin: EmeraPlugin;

    constructor(app: App, plugin: EmeraPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Components folder')
            .setDesc('Plugin will look for components only in this folder')
            .addText(text => text
                .setPlaceholder('.components')
                .setValue(this.plugin.settings.componentsFolder)
                .onChange(async (value) => {
                    this.plugin.settings.componentsFolder = value;
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName('Refresh user module')
            .setDesc('Click this if you made any changes to any exported members after opening Obsidian')
            .addButton(button => button
                .setButtonText('Refresh')
                .onClick(async () => {
                   await this.plugin.refreshUserModule();
                   new Notice('User module was reloaded.');
                })
            );
    }
}
