import { TFile } from "obsidian";
import type EmeraPlugin from "../../main";
import { createStrictContext } from "./utils";
import type { EmeraStorage } from "./storage";

export type EmeraContextType = {
    plugin: EmeraPlugin,
    file: TFile | null,
    storage: EmeraStorage,
};

export const [EmeraContextProvider, useEmeraContext] = createStrictContext<EmeraContextType>('EmeraContext');
