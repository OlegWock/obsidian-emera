
// How this should work:
// * User component calls hook `useEmeraStorage<T>(key: string, defaultValue: T)`
// * Hook creates an atom under the hood and returns standart [value, setValue] functions
// * When plugin is initialized, it will load file <components folder>/storage.json (or maybe store it in .obsidian??)
// and put its content into memory
// * When atom value changes, it will update value in memory and also write it to json file (maybe buffered)

import { atom, Atom, getDefaultStore, useAtom } from "jotai";
import type EmeraPlugin from "../../main";
import { useEmeraContext } from "./context";

export const createEmeraStorage = (plugin: EmeraPlugin) => {
    const filePath = `${plugin.settings.componentsFolder}/storage.json`;
    let state: Record<string, any> = {};
    let flushTimerId: null | ReturnType<typeof setTimeout> = null;
    const atoms: Record<string, Atom<any>> = {};
    const unsubFunction: VoidFunction[] = [];

    const init = async () => {
        const file = plugin.app.vault.getFileByPath(filePath);
        if (file) {
            const content = await plugin.app.vault.read(file);
            console.log('File content', content);
            state = JSON.parse(content);
        }
        console.log('Initiated storage with state', state);
    };

    const destroy = () => {
        unsubFunction.forEach(cb => cb());
    };

    const flush = async () => {
        const id = Math.random();
        console.log('Start flush', id);
        let file = plugin.app.vault.getFileByPath(filePath);
        console.log('File', file);
        const stateStr = JSON.stringify(state, null, 4);
        if (!file) {
            await plugin.app.vault.create(filePath, stateStr);
        } else {
            await plugin.app.vault.modify(file, stateStr);
        }
        console.log('Finish flush', id);
    };

    const set = (prop: string, val: any) => {
        state[prop] = val;
        if (flushTimerId !== null) clearTimeout(flushTimerId);
        flushTimerId = setTimeout(async () => {
            await flush();
            flushTimerId = null;
        }, 100);
    };

    const get = (prop: string) => {
        return state[prop];
    };

    const getAtom = (prop: string, defaultValue: any) => {
        if (atoms[prop]) return atoms[prop];

        const primitiveAtom = atom((prop in state) ? state[prop] : defaultValue);
        atoms[prop] = primitiveAtom;
        const store = getDefaultStore();
        unsubFunction.push(
            store.sub(primitiveAtom, () => {
                const value = store.get(primitiveAtom);
                set(prop, value);
            })
        );
        return primitiveAtom;
    };


    return {
        init,
        destroy,
        set,
        get,
        flush,
        getAtom,
    };
};

export type EmeraStorage = ReturnType<typeof createEmeraStorage>;

export const useStorage = <T>(key: string, defaultValue: T) => {
    const { storage } = useEmeraContext();
    const atom = storage.getAtom(key, defaultValue);
    return useAtom(atom);
};
