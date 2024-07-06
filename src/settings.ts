import type MyPlugin from "main";
import { PluginSettingTab, App, Setting } from "obsidian";

export class SettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
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
    }
}
