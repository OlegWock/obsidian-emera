import type { SyntaxNodeRef } from '@lezer/common';
import {
    EditorView,
    ViewPlugin,
    ViewUpdate
} from "@codemirror/view";
import {
    StateField,
    StateEffect,
    EditorState,
} from "@codemirror/state";
import { MarkdownView } from 'obsidian';
import type { EmeraPlugin } from '../plugin';

export const isCursorBetweenNodes = (state: EditorState, node1: SyntaxNodeRef, node2: SyntaxNodeRef) => {
    const min = Math.min(node1.from, node2.from) - 1;
    const max = Math.max(node1.to, node2.to) + 1;

    const selection = state.selection;
    for (let range of selection.ranges) {
        if (range.from <= max && range.to >= min) {
            return true;
        }
    }

    return false;
};

export const isCursorInsideNode = (state: EditorState, node: SyntaxNodeRef) => {
    // TODO: Perhaps this should be `isCursorInsideSameLine` 
    return isCursorBetweenNodes(state, node, node);
};

export const findCurrentView = (plugin: EmeraPlugin, editorView: EditorView): MarkdownView | null => {
    let view: MarkdownView | null = null;
    plugin.app.workspace.iterateAllLeaves((leaf) => {
        // @ts-ignore
        if (leaf.view && leaf.view instanceof MarkdownView && leaf.view.editor.cm === editorView) {
            view = leaf.view;
        }
    });

    return view;
};


export const emeraCurrentEditorProviderPlugin = ViewPlugin.fromClass(class {
    view: EditorView;

    constructor(view: EditorView) {
        this.view = view;
        setTimeout(() => {
            view.dispatch({
                effects: setEditorStateEffect.of(this.view)
            });
        }, 0);
    }

    update(update: ViewUpdate) { }
}, {});

const setEditorStateEffect = StateEffect.define<EditorView>();

export const emeraCurrentEditorStateField = StateField.define<null | EditorView>({
    create() {
        return null;
    },
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setEditorStateEffect)) {
                value = e.value
            }
        }
        return value
    }
})
