import { TFile } from "obsidian";
import type EmeraPlugin from "../main";
import { createStrictContext } from "./utils";

export type EmeraContextType = {
    plugin: EmeraPlugin,
    file: TFile | null,
};

export const [EmeraContextProvider, useEmeraContext] = createStrictContext<EmeraContextType>('EmeraContext');
