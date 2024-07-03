import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    PluginSpec,
    PluginValue,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import { SyntaxNodeRef } from '@lezer/common';
import { EMERA_INLINE_JS_PREFIX } from "./consts";

const CodeMirror = (window as any).CodeMirror;

class InlineCodePlugin implements PluginValue {
    cache: Record<string, InlineJsWidget>;
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.cache = {};
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    destroy() { }

    isCursorInsideNode(view: EditorView, node: SyntaxNodeRef) {
        const state = view.state;
        const selection = state.selection;

        for (let range of selection.ranges) {
            if (range.from <= node.to + 1 && range.to >= node.from - 1) {
                return true;
            }
        }

        return false;
    }

    buildDecorations = (view: EditorView): DecorationSet => {
        const builder = new RangeSetBuilder<Decoration>();
        console.log('Build decorations');
        console.log('Selection', view.state.selection.ranges.map(r => `${r.from}-${r.to}`));
        for (let { from, to } of view.visibleRanges) {
            syntaxTree(view.state).iterate({
                from,
                to,
                enter: (node) => {
                    if (node.type.name !== 'inline-code') return;
                    if (this.isCursorInsideNode(view, node)) return;
                    const nodeContent = view.state.doc.sliceString(node.from, node.to);
                    console.log('Code block content', nodeContent);
                    if (!nodeContent.startsWith(EMERA_INLINE_JS_PREFIX)) return;
                    const code = nodeContent.slice(EMERA_INLINE_JS_PREFIX.length);
                    let widget = this.cache[code];
                    if (!widget) {
                        widget = new InlineJsWidget(code);
                        this.cache[code] = widget;
                    }
                    builder.add(
                        node.from,
                        node.to,
                        Decoration.replace({ widget })
                    );
                },
            });
        }

        return builder.finish();
    }
}

const pluginSpec: PluginSpec<InlineCodePlugin> = {
    decorations: (value: InlineCodePlugin) => value.decorations,
};


export const inlideCodePlugin = [
    ViewPlugin.fromClass(
        InlineCodePlugin,
        pluginSpec
    ),
];


export class InlineJsWidget extends WidgetType {
    code: string;
    evaluated: any;
    originalNode: SyntaxNodeRef;
    id: string;

    constructor(code: string) {
        super();
        this.code = code;
        this.evaluated = eval?.(code);
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.style.background = 'hsla(var(--color-accent-hsl), 0.15)';
        span.style.color = 'var(--color-accent)';
        span.style.padding = '2px 6px';
        span.style.borderRadius = '4px';
        span.innerText = this.evaluated;
        span.dataset.id = this.id;
        span.addEventListener('click', (e) => {
            e.preventDefault();
            view.dispatch({
                selection: { anchor: view.posAtDOM(span) },
                scrollIntoView: true
            });
        });
        return span;
    }
}

export const registerCodemirrorMode = (name: string, original: string) => {
    CodeMirror.defineMode(name, (config: any) => CodeMirror.getMode(config, original));
    CodeMirror.defineMIME(`text/x-${name}`, 'jsx');
};
