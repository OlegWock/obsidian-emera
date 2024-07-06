import { TFile } from "obsidian";
import type EmeraPlugin from "../main";
import { createStrictContext } from "./utils";

type EmeraContextType = {
    plugin: EmeraPlugin,
    file: TFile,
};

export const [EmeraContextProvider, useEmeraContext] = createStrictContext<EmeraContextType>('EmeraContext');
