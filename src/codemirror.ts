import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    PluginValue,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import { SyntaxNodeRef } from '@lezer/common';
import { EMERA_INLINE_JS_PREFIX, EMERA_INLINE_JSX_PREFIX } from "./consts";
import type EmeraPlugin from "../main";
import { MarkdownView, TFile } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { renderComponent } from "./renderer";
import { compileJsxIntoComponent } from "./bundle";
import { ComponentType } from "react";

const CodeMirror = (window as any).CodeMirror;

export const emeraEditorPlugin = (plugin: EmeraPlugin) => [
    ViewPlugin.fromClass(
        class InlineCodePlugin implements PluginValue {
            // TODO: cache should be per-page
            jsCache: Record<string, InlineJsWidget>;
            jsxCache: Record<string, InlineJsxWidget>;
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.jsCache = {};
                this.jsxCache = {};
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

            findCurrentView(editorView: EditorView): MarkdownView | null {
                let view: MarkdownView | null = null;
                plugin.app.workspace.iterateAllLeaves((leaf) => {
                    // @ts-ignore
                    if (leaf.view && leaf.view instanceof MarkdownView && leaf.view.editor.cm === editorView) {
                        view = leaf.view;
                    }
                });

                return view;
            }


            buildDecorations(view: EditorView): DecorationSet {
                const builder = new RangeSetBuilder<Decoration>();
                const mdView = this.findCurrentView(view);
                if (!mdView) {
                    return builder.finish();
                };
                const mdViewState = mdView.getState();
                if (mdViewState.mode === 'source' && mdViewState.source) {
                    // Don't do anything in Source mode, we care only about LivePreview
                    return builder.finish();
                }
                const file = mdView?.file;
                // TODO: allow user `export` variables/function in one block and then use them in other block

                for (let { from, to } of view.visibleRanges) {
                    syntaxTree(view.state).iterate({
                        from,
                        to,
                        enter: (node) => {
                            // console.log('Handling node', node.type.name, node);
                            if (!node.type.name.startsWith('inline-code')) return;
                            if (this.isCursorInsideNode(view, node)) return;
                            const nodeContent = view.state.doc.sliceString(node.from, node.to);
                            console.log('Handling code block', {node, nodeContent});
                            let type: 'js' | 'jsx';
                            let code: string;
                            if (nodeContent.startsWith(EMERA_INLINE_JS_PREFIX)) {
                                type = 'js';
                                code = nodeContent.slice(EMERA_INLINE_JS_PREFIX.length);
                            } else if (nodeContent.startsWith(EMERA_INLINE_JSX_PREFIX)) {
                                type = 'jsx';
                                code = nodeContent.slice(EMERA_INLINE_JSX_PREFIX.length);
                            } else {
                                return;
                            }

                            const cache = (type === 'js' ? this.jsCache : this.jsxCache);
                            let widget = cache[code];
                            if (!widget) {
                                widget = type === 'js' ? new InlineJsWidget(code) : new InlineJsxWidget(code, plugin, file);
                                cache[code] = widget;
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
        },
        {
            decorations: (value) => value.decorations,
        }
    ),
];


export class InlineJsWidget extends WidgetType {
    code: string;
    evaluated: any;

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

export class InlineJsxWidget extends WidgetType {
    component: ComponentType<{}>;
    reactRoot?: Root;
    rootElement?: HTMLSpanElement;

    constructor(
        private code: string,
        private plugin: EmeraPlugin,
        private file: TFile | null,
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        if (!this.rootElement) {
            const span = document.createElement("span");
            span.addEventListener('click', (e) => {
                e.preventDefault();
                view.dispatch({
                    selection: { anchor: view.posAtDOM(span) },
                    scrollIntoView: true
                });
            });
            this.rootElement = span;
            this.reactRoot = createRoot(span);
            renderComponent({
                // TODO: replace this with loading component
                component: () => 'Loading...',
                container: this.reactRoot,
                plugin: this.plugin,
                context: {
                    file: this.file,
                },
            });

            this.plugin.componentsLoaded
                .then(() => compileJsxIntoComponent(this.code))
                .then((component) => {
                    this.component = component;
                    if (this.reactRoot) {
                        renderComponent({
                            // TODO: replace this with loading component
                            component,
                            container: this.reactRoot,
                            plugin: this.plugin,
                            context: {
                                file: this.file,
                            },
                        });
                    }
                });
        }

        return this.rootElement;
    }
}

export const registerCodemirrorMode = (name: string, original: string) => {
    CodeMirror.defineMode(name, (config: any) => CodeMirror.getMode(config, original));
    CodeMirror.defineMIME(`text/x-${name}`, 'jsx');
};
