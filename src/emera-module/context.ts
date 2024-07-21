import { App, TFile } from "obsidian";
import type { EmeraPlugin } from '../plugin';
import { createStrictContext } from "./utils";
import type { EmeraStorage } from "./storage";

export type EmeraContextType = {
    file: TFile | null,
    frontmatter: Record<string, any> | null | undefined,
    plugin: EmeraPlugin,
    storage: EmeraStorage,
    app: App,
};

export const [EmeraContextProvider, useEmeraContext] = createStrictContext<EmeraContextType>('EmeraContext');
