import type { SyntaxNodeRef } from '@lezer/common';
import {
    EditorView,
} from "@codemirror/view";
import {
    EditorState,
} from "@codemirror/state";
import { MarkdownView } from 'obsidian';
import type { EmeraPlugin } from '../plugin';

export const isCursorOnSameLineWithNode = (state: EditorState, node1: SyntaxNodeRef, node2: SyntaxNodeRef, allowance = 0) => {
    const doc = state.doc;
    const node1Line = doc.lineAt(node1.from);
    const node2Line = doc.lineAt(node2.to);

    const selection = state.selection;
    for (let range of selection.ranges) {
        const cursorLineStart = doc.lineAt(range.from).number;
        const cursorLineEnd = doc.lineAt(range.from).number;
        const startLine = Math.min(node1Line.number, node2Line.number) - allowance;
        const endLine = Math.max(node1Line.number, node2Line.number) + allowance;
        return (cursorLineStart >= startLine && cursorLineStart <= endLine) || (cursorLineEnd >= startLine && cursorLineEnd <= endLine);
    }

    return false;
};

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
