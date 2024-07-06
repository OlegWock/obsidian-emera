import { TFile } from "obsidian";
import type { EmeraPlugin } from '../plugin';
import { createStrictContext } from "./utils";
import type { EmeraStorage } from "./storage";

export type EmeraContextType = {
    file: TFile,
    frontmatter: Record<string, any> | null | undefined,
    plugin: EmeraPlugin,
    storage: EmeraStorage,
};

export const [EmeraContextProvider, useEmeraContext] = createStrictContext<EmeraContextType>('EmeraContext');
