import { TFile } from "obsidian";
import type { EmeraPlugin } from '../plugin';
import { createStrictContext } from "./utils";
import type { EmeraStorage } from "./storage";

export type EmeraContextType = {
    plugin: EmeraPlugin,
    file: TFile,
    storage: EmeraStorage,
};

export const [EmeraContextProvider, useEmeraContext] = createStrictContext<EmeraContextType>('EmeraContext');
