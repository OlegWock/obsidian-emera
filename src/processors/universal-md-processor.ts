import type { SyntaxNodeRef, SyntaxNode } from '@lezer/common';
import { syntaxTree } from "@codemirror/language";
import {
    RangeSetBuilder,
    StateField,
    Transaction,
    StateEffect,
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    WidgetType,
} from "@codemirror/view";
import { MarkdownPostProcessorContext, TFile } from 'obsidian';
import { EmeraPlugin } from '../plugin';
import { iife } from '../utils';
import { emeraCurrentEditorStateField, findCurrentView, isCursorBetweenNodes, isCursorInsideNode } from './utils';


export type UniversalProcessorContext = {
    file: TFile,
} & ({
    mode: 'preview'
    originalPreviewElement: Element
} | {
    mode: 'edit',
});

const redecorateTrigger = StateEffect.define<null>();

export abstract class UniversalMdProcessor {
    abstract previewBaseSelector: string;

    editorModeOfOperation: 'single' | 'range' = 'single';
    abstract inline: boolean;

    public plugin: EmeraPlugin;

    constructor(plugin: EmeraPlugin) {
        this.plugin = plugin;
    }

    abstract shouldProcessPreviewElement(element: Element): boolean;
    abstract shouldProcessEditorNode(node: SyntaxNodeRef, content: string): boolean | 'start' | 'end';

    abstract process(wrapper: HTMLElement, content: string, ctx: UniversalProcessorContext): void;

    markdownPostProcessor = (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        const file = this.plugin.app.vault.getFileByPath(ctx.sourcePath)!;
        const candidates = Array.from(el.querySelectorAll(this.previewBaseSelector));
        const toProcess = candidates.filter(el => this.shouldProcessPreviewElement(el));
        toProcess.forEach(el => {
            const content = el.textContent ?? '';
            const replacement = document.createElement(this.inline ? 'span' : 'div');
            this.process(replacement, content, {
                file,
                mode: 'preview',
                originalPreviewElement: el,
            });
            el.replaceWith(replacement);
        });
    };

    codemirrorStateField = iife(() => {
        const parent = this;
        return StateField.define<DecorationSet>({
            create(state): DecorationSet {
                return Decoration.none;
            },
            update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
                // console.log('Transaction', transaction);

                const builder = new RangeSetBuilder<Decoration>();
                const state = transaction.state;

                const manualRefresh = transaction.effects.some(effect => effect.is(redecorateTrigger));
                if (!manualRefresh && !transaction.docChanged && !transaction.selection) {
                    return builder.finish();
                }

                const editor = state.field(emeraCurrentEditorStateField);
                if (!editor) return builder.finish();

                const mdView = findCurrentView(parent.plugin, editor);
                if (!mdView) return builder.finish();

                const mdViewState = mdView.getState();
                // Don't do anything in Source mode, we care only about LivePreview
                if (mdViewState.mode === 'source' && mdViewState.source) {
                    return builder.finish();
                }

                const file = mdView?.file;
                if (!file) return builder.finish();

                let startNode: SyntaxNode | null = null;

                syntaxTree(state).iterate({
                    enter: (node) => {
                        const nodeContent = state.doc.sliceString(node.from, node.to);

                        if (parent.editorModeOfOperation === 'single') {
                            if (isCursorInsideNode(state, node)) {
                                return;
                            }

                            if (!parent.shouldProcessEditorNode(node, nodeContent)) {
                                return;
                            }

                            const widget = new parent.CodeMirrorWidget(nodeContent, {
                                file,
                                mode: 'edit',
                            });
                            builder.add(
                                node.from,
                                node.to,
                                Decoration.replace({ widget })
                            );
                        } else {
                            const mark = parent.shouldProcessEditorNode(node, nodeContent);

                            if (mark === true) {
                                throw new Error('specify if this start or end node');
                            }

                            if (mark === 'start' && !startNode) {
                                startNode = node.node;
                            } else if (mark === 'end' && !!startNode) {
                                if (!isCursorBetweenNodes(state, startNode, node)) {
                                    const text = state.doc.sliceString(startNode.from, node.to).trim();
                                    const widget = new parent.CodeMirrorWidget(text, {
                                        file,
                                        mode: 'edit',
                                    });
                                    builder.add(
                                        startNode.from - 1,
                                        node.to + 1,
                                        Decoration.replace({ widget })
                                    );
                                }

                                startNode = null
                            }
                        }
                    },
                });

                return builder.finish();
            },
            provide(field: StateField<DecorationSet>) {
                return EditorView.decorations.from(field);
            },
        });
    });

    CodeMirrorWidget = iife(() => {
        const parent = this;

        return class CodeMirrorWidget extends WidgetType {
            content: string;
            ctx: UniversalProcessorContext;

            constructor(content: string, ctx: UniversalProcessorContext) {
                super();
                this.content = content;
                this.ctx = ctx;
            }

            eq(widget: CodeMirrorWidget): boolean {
                return this.content === widget.content;
            }

            toDOM(view: EditorView): HTMLElement {
                const wrapper = document.createElement(parent.inline ? 'span' : 'div');
                wrapper.addEventListener('click', (e) => {
                    e.preventDefault();
                    view.dispatch({
                        selection: { anchor: view.posAtDOM(wrapper) },
                        scrollIntoView: true
                    });
                });
                parent.process(wrapper, this.content, this.ctx);
                return wrapper;
            }
        }
    });
}
