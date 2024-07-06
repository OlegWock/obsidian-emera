import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateEffect } from "@codemirror/state";
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
import type { EmeraPlugin } from './plugin';
import { MarkdownView, TFile } from "obsidian";
import { Root } from "react-dom/client";
import { renderComponent } from "./renderer";
import { compileJsxIntoComponent } from "./bundler";
import { ComponentType } from "react";
import { eventBus } from "./events";
import { LoadingInline } from "./components/LoadingInline";

const CodeMirror = (window as any).CodeMirror;

const redecorateTrigger = StateEffect.define<null>()

class InlineJsWidget extends WidgetType {
    code: string;
    evaluated: any;
    error: string | null = null;

    constructor(code: string) {
        super();
        this.code = code;
        try {
            this.evaluated = eval?.(code);
        } catch (err) {
            this.error = err.toString();
        }
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.classList.add('emera-inline-js');
        span.innerText = this.error ? `❗️${this.error}` : this.evaluated;
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

class InlineJsxWidget extends WidgetType {
    component: ComponentType<{}>;
    reactRoot?: Root;
    rootElement?: HTMLSpanElement;

    constructor(
        private code: string,
        private plugin: EmeraPlugin,
        private file: TFile,
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
            this.reactRoot = renderComponent({
                component: LoadingInline,
                container: this.rootElement,
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

export const emeraEditorPlugin = (plugin: EmeraPlugin) => [
    ViewPlugin.fromClass(
        class InlineCodePlugin implements PluginValue {
            // TODO: cache should be per-page
            jsCache: Record<string, InlineJsWidget>;
            jsxCache: Record<string, InlineJsxWidget>;
            decorations: DecorationSet;
            view: EditorView;

            constructor(view: EditorView) {
                this.view = view;
                this.jsCache = {};
                this.jsxCache = {};
                this.decorations = this.buildDecorations(view);

                eventBus.on('onComponentsReloaded', this.onComponentsReloaded);
            }

            update(update: ViewUpdate) {
                const manualRefresh = update.transactions.some(tr => tr.effects.some(effect => effect.is(redecorateTrigger)));
                if (manualRefresh) console.log('Manual refresh of editor decorations')
                if (manualRefresh || update.docChanged || update.viewportChanged || update.selectionSet) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            destroy() {
                eventBus.off('onComponentsReloaded', this.onComponentsReloaded);
            }

            onComponentsReloaded = () => {
                console.log('Components reloaded, wiping inline JSX cache');
                this.jsxCache = {};
                this.view.dispatch({
                    effects: [redecorateTrigger.of(null)],
                });
            };


            isCursorInsideNode(view: EditorView, node: SyntaxNodeRef) {
                // TODO: Perhaps this should be `isCursoreInsideSameLine` 
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
                if (!file) {
                    return builder.finish();
                }

                for (let { from, to } of view.visibleRanges) {
                    syntaxTree(view.state).iterate({
                        from,
                        to,
                        enter: (node) => {
                            // console.log('Handling node', node.type.name, node);
                            if (!node.type.name.startsWith('inline-code')) return;
                            if (this.isCursorInsideNode(view, node)) return;
                            const nodeContent = view.state.doc.sliceString(node.from, node.to);
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


export const registerCodemirrorMode = (name: string, original: string) => {
    CodeMirror.defineMode(name, (config: any) => CodeMirror.getMode(config, original));
    CodeMirror.defineMIME(`text/x-${name}`, 'jsx');
};
