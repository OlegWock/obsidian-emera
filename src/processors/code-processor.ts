import type { SyntaxNode } from '@lezer/common';
// @ts-ignore
import { syntaxTree, tokenClassNodeProp, lineClassNodeProp } from "@codemirror/language";
import {
    RangeSetBuilder,
    StateField,
    Transaction,
    EditorState,
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    WidgetType,
} from "@codemirror/view";
import { MarkdownPostProcessorContext, TFile, MarkdownView, editorInfoField, editorEditorField, editorLivePreviewField } from 'obsidian';
import { EmeraPlugin } from '../plugin';
import { iife } from '../utils';
import { isCursorBetweenNodes, isCursorOnSameLineWithNode } from './utils';
import { EMERA_INLINE_JS_PREFIX, EMERA_INLINE_JSX_PREFIX, EMERA_JS_LANG_NAME, EMERA_JSX_LANG_NAME, EMERA_JSX_SHORTHAND_LANG_NAME } from '../consts';
import { getAnonymousDocScope, getPageScope, getScope, ScopeNode } from '../scope';
import { compileJsxIntoFactory, importFromString, transpileCode } from '../bundler';
import { renderComponent } from '../renderer';
import { LoadingInline } from '../components/LoadingInline';
import { Root } from 'react-dom/client';
import { ErrorAlert } from '../components/ErrorBoundary';
import { EmptyBlock } from '../components/EmptyBlock';
import { JsBlockPlaceholder } from '../components/JsBlockPlaceholder';
import { RootComponent } from 'src/components/RootComponent';


type ProcessorContext = {
    file: TFile | null,
    index: number,
    total: number,
    readScope: ScopeNode,
    writeScope: ScopeNode,
    shortcutComponent?: string,
} & ({
    mode: 'preview'
    originalPreviewElement: Element
} | {
    mode: 'edit',
});

type ToProcessEditorRecord = {
    type:
    | 'inline-js'
    | 'inline-jsx'
    | 'block-js'
    | 'block-jsx',
    startNode: SyntaxNode,
    endNode: SyntaxNode,
    content: string,
    cursorInside: boolean,
    shortcutComponent?: string,
};
type ToProcessPreviewRecord = {
    type:
    | 'inline-js'
    | 'inline-jsx'
    | 'block-js'
    | 'block-jsx',
    el: HTMLElement,
    content: string,
    shortcutComponent?: string,
};

type ProcessFunction = (wrapper: HTMLElement, content: string, ctx: ProcessorContext) => void;

export class EmeraCodeProcessor {
    public plugin: EmeraPlugin;

    constructor(plugin: EmeraPlugin) {
        this.plugin = plugin;
    }

    processInlineJs: ProcessFunction = async (wrapper: HTMLElement, content: string, ctx: ProcessorContext) => {
        const code = content.slice(EMERA_INLINE_JS_PREFIX.length);
        wrapper.classList.add('emera-inline-js');
        wrapper.textContent = 'Loading...';

        let evaluated;
        try {
            // console.log('Evaluating inline js', content);

            const transpiled = transpileCode(`export default () => ${code}`, {
                rewriteImports: false,
                scope: ctx.readScope,
            });

            await await ctx.readScope.waitForUnblock();
            const module = await importFromString(transpiled);
            evaluated = await module.default();
        } catch (err) {
            console.error(err);
            evaluated = `❗️${err.toString()}`;
        }

        wrapper.textContent = evaluated;
    };

    processInlineJsx: ProcessFunction = async (wrapper: HTMLElement, content: string, ctx: ProcessorContext) => {
        const code = content.slice(EMERA_INLINE_JSX_PREFIX.length);
        wrapper.classList.add('emera-inline-jsx');

        try {
            const reactRoot = renderComponent({
                component: LoadingInline,
                container: wrapper,
                plugin: this.plugin,
                context: {
                    file: ctx.file,
                },
            });

            await this.plugin.componentsLoadedPromise;

            const factory = await compileJsxIntoFactory(code, ctx.readScope);
            await ctx.readScope.waitForUnblock();
            // console.log('Processing inline JSX', code);
            // console.log('Compiled into', component);
            // console.log('Using scope', ctx.readScope, { ...ctx.readScope.scope });
            renderComponent({
                component: RootComponent,
                props: { factory },
                container: reactRoot,
                plugin: this.plugin,
                context: {
                    file: ctx.file,
                },
            });
        } catch (err) {
            console.error(err);
            wrapper.textContent = `❗️${err.toString()}`;
        }
    };

    processBlockJs: ProcessFunction = async (wrapper: HTMLElement, content: string, ctx: ProcessorContext) => {
        ctx.writeScope.block();
        wrapper.classList.add('emera-block-js');
        const code = content;
        const root = renderComponent({
            component: JsBlockPlaceholder,
            container: wrapper,
            plugin: this.plugin,
            context: {
                file: ctx.file,
            },
        });

        await ctx.readScope.waitForUnblock();
        try {
            const transpiled = transpileCode(code, { scope: ctx.readScope });
            const module = await importFromString(transpiled);
            ctx.writeScope.reset();
            ctx.writeScope.setMany(module);
        } catch (error) {
            renderComponent({
                component: ErrorAlert,
                container: root,
                props: {
                    error,
                },
                plugin: this.plugin,
                context: {
                    file: ctx.file,
                },
            });
        } finally {
            ctx.writeScope.unblock();
        }
    };

    processBlockJsx: ProcessFunction = async (wrapper: HTMLElement, content: string, ctx: ProcessorContext) => {
        wrapper.classList.add('emera-block-jsx');
        // console.log('Processing JSX block');
        // console.log(content);

        if (content) {
            try {
                let container: Element | Root = wrapper;
                if (!this.plugin.isComponentsLoaded || ctx.readScope.isBlocked) {
                    container = renderComponent({
                        component: LoadingInline,
                        container: wrapper,
                        plugin: this.plugin,
                        context: {
                            file: ctx.file,
                        },
                    });
                }

                await this.plugin.componentsLoadedPromise;
                await ctx.readScope.waitForUnblock();

                if (ctx.shortcutComponent) {
                    const component = ctx.readScope.get(ctx.shortcutComponent);
                    container = renderComponent({
                        component,
                        container,
                        plugin: this.plugin,
                        children: ctx.shortcutComponent ? content : undefined,
                        context: {
                            file: ctx.file,
                        },
                    });
                } else {
                    const factory = await compileJsxIntoFactory(content, ctx.readScope);
                    container = renderComponent({
                        component: RootComponent,
                        props: { factory },
                        container,
                        plugin: this.plugin,
                        children: ctx.shortcutComponent ? content : undefined,
                        context: {
                            file: ctx.file,
                        },
                    });
                }


            } catch (err) {
                console.error(err);
                renderComponent({
                    component: ErrorAlert,
                    props: {
                        error: err
                    },
                    container: wrapper,
                    plugin: this.plugin,
                    context: {
                        file: ctx.file,
                    },
                });
            }
        } else {
            renderComponent({
                component: EmptyBlock,
                container: wrapper,
                plugin: this.plugin,
                context: {
                    file: ctx.file,
                },
            });
        }
    };



    createCodeMirrorWidget = (func: ProcessFunction, inline: boolean) => {
        return class CodeMirrorWidget extends WidgetType {
            content: string;
            ctx: ProcessorContext;
            renderKey: string;

            constructor(renderKey: string, content: string, ctx: ProcessorContext) {
                super();
                this.content = content;
                this.ctx = ctx;
                this.renderKey = renderKey;
            }

            eq(widget: CodeMirrorWidget): boolean {
                return this.renderKey === widget.renderKey;
            }

            toDOM(view: EditorView): HTMLElement {
                const wrapper = document.createElement(inline ? 'span' : 'div');
                const reactRootWrapper = document.createElement(inline ? 'span' : 'div');
                wrapper.appendChild(reactRootWrapper);
                wrapper.addEventListener('click', (e) => {
                    e.preventDefault();
                    view.dispatch({
                        selection: { anchor: view.posAtDOM(wrapper) },
                        scrollIntoView: true
                    });
                });
                func(reactRootWrapper, this.content, this.ctx);
                return wrapper;
            }
        }
    };

    InlineJsWidget = this.createCodeMirrorWidget(this.processInlineJs, true);
    InlineJsxWidget = this.createCodeMirrorWidget(this.processInlineJsx, true);
    BlockJsWidget = this.createCodeMirrorWidget(this.processBlockJs, false);
    BlockJsxWidget = this.createCodeMirrorWidget(this.processBlockJsx, false);

    markdownPostProcessor = iife(() => {
        const processQueue = async () => {
            processingRequested = false;
            console.log('Starting queue processing');

            Object.entries(queueMap).forEach(async ([key, { file, queue }]) => {
                console.log('[PREVIEW] Will process elements', queue);
                const startScope = file ? getPageScope(this.plugin, file) : getAnonymousDocScope(this.plugin, key);
                await startScope.waitForUnblock();
                console.log('[PREVIEW] Disposing page scope descendants');
                startScope.disposeDescendants();

                let readScope = startScope;
                queue.forEach((el, index, arr) => {
                    const writeScopeId = file ? `page/${file.path}/${index}` : `anon-doc/${key}/${index}`;
                    let writeScope = getScope(writeScopeId);
                    if (writeScope) {
                        writeScope.dispose();
                    }
                    writeScope = new ScopeNode(writeScopeId);
                    readScope.addChild(writeScope);
                    const processorCtx = {
                        file,
                        index,
                        total: arr.length,
                        mode: 'preview' as const,
                        originalPreviewElement: el.el,
                        shortcutComponent: el.shortcutComponent,
                        readScope,
                        writeScope,
                    };

                    const replacement = document.createElement(el.type.startsWith('inline') ? 'span' : 'div');
                    if (el.type === 'inline-js') this.processInlineJs(replacement, el.content, processorCtx);
                    if (el.type === 'inline-jsx') this.processInlineJsx(replacement, el.content, processorCtx);
                    if (el.type === 'block-js') this.processBlockJs(replacement, el.content, processorCtx);
                    if (el.type === 'block-jsx') this.processBlockJsx(replacement, el.content, processorCtx);

                    readScope = writeScope;
                    if (el.type.startsWith('inline')) el.el.replaceWith(replacement);
                    else el.el.parentElement!.replaceWith(replacement);
                });

                delete queueMap[key];
            });
        };

        const queueMap: Record<string, {
            file: TFile | null,
            queue: ToProcessPreviewRecord[],
        }> = {};

        let processingRequested = false;

        return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            if (el.dataset.emeraMarkdown) {
                // This is content from our <Markdown /> component, we don't want to process it
                return;
            }

            // console.log('MD post', el, ctx);

            const file = ctx.sourcePath ? this.plugin.app.vault.getFileByPath(ctx.sourcePath) : null;
            const code = Array.from(el.querySelectorAll('code'));
            const toProcess = code.flatMap((el): ToProcessPreviewRecord[] => {
                const content = el.textContent ?? '';
                if (el.parentElement?.tagName.toLowerCase() === 'pre') {
                    // Multi-line code block
                    console.log('Process el', el.className);
                    if (el.className.includes(`language-${EMERA_JSX_LANG_NAME}`) || el.className.includes(`language-${EMERA_JSX_SHORTHAND_LANG_NAME}`)) {
                        const regex = new RegExp(`language-(?:${EMERA_JSX_LANG_NAME}|${EMERA_JSX_SHORTHAND_LANG_NAME}):([\\S]+)`);
                        const match = regex.exec(el.className);
                        const componentSpecifier = match?.[1];
                        console.log('Process el', el.className, 'match', match);
                        return [{
                            type: 'block-jsx',
                            el,
                            content,
                            shortcutComponent: componentSpecifier,
                        }];
                    }

                    if (el.className.includes(`language-${EMERA_JS_LANG_NAME}`)) {
                        return [{
                            type: 'block-js',
                            el,
                            content,
                        }];
                    }

                    return [];
                } else {
                    // Inline
                    if (content.startsWith(EMERA_INLINE_JSX_PREFIX)) {
                        return [{
                            type: 'inline-jsx',
                            el,
                            content,
                        }];
                    }

                    if (content.startsWith(EMERA_INLINE_JS_PREFIX)) {
                        return [{
                            type: 'inline-js',
                            el,
                            content,
                        }];
                    }

                    return [];
                }
            });

            if (!queueMap[ctx.docId]) {
                queueMap[ctx.docId] = {
                    file,
                    queue: [],
                };
            }
            queueMap[ctx.docId].queue.push(...toProcess);
            if (!processingRequested) {
                setTimeout(() => processQueue(), 10);
                processingRequested = true;
                console.log('Scheduled queue processing');
            }
        };
    });

    codemirrorStateField = iife(() => {
        const parent = this;
        type PluginState = {
            decorations: DecorationSet,
            cache: { type: string, content: string, key: string, cursorInside: boolean }[],
        };

        const processCodeblocks = ({ oldState, editorState, transaction }: {
            oldState?: PluginState,
            editorState?: EditorState,
            transaction?: Transaction
        }): PluginState => {
            if (!oldState) {
                oldState = {
                    decorations: Decoration.none,
                    cache: [],
                };
            }

            const builder = new RangeSetBuilder<Decoration>();
            const state = transaction?.state ?? editorState;
            if (!state) return oldState;

            const importantUpdate = transaction ? transaction.docChanged : true;
            const selectionChange = transaction ? transaction.selection : true;
            if (!importantUpdate && !selectionChange) {
                return oldState;
            }

            const editor = state.field(editorEditorField);
            if (!editor) {
                console.log(`[EDITOR] Can't get editor view, skipping`);
                return {
                    decorations: builder.finish(),
                    cache: [],
                };
            }


            // Kind of hacky, officially editorInfoField contains MarkdownFileInfo, which is limited
            // subset of MarkdownView, but in fact this state field contains full MarkdownView
            const mdView = state.field(editorInfoField) as MarkdownView | null;
            console.log('[EDITOR] Current view', mdView);
            if (!mdView) {
                console.log(`[EDITOR] Can't find current view, skipping`);
                return {
                    decorations: builder.finish(),
                    cache: [],
                };
            }

            const isLivePreview = state.field(editorLivePreviewField);
            // We care only about LivePreview, don't do anything in Source mode
            if (!isLivePreview) {
                console.log(`[EDITOR] Editor in source mode, skipping`);
                return {
                    decorations: builder.finish(),
                    cache: [],
                };
            }

            const file = mdView.file;
            if (!file) {
                console.log(`[EDITOR] Couldn't find file, skipping`);
                return {
                    decorations: builder.finish(),
                    cache: [],
                };
            }

            let currentBlockStartNode: SyntaxNode | null = null;
            let currentBlockStartType: 'block-js' | 'block-jsx' | null = null;

            const toProcess: ToProcessEditorRecord[] = [];

            syntaxTree(state).iterate({
                enter: (node) => {
                    const nodeContent = state.doc.sliceString(node.from, node.to);

                    const tokenTypes = ((node.type.prop(tokenClassNodeProp) as string) || '').split(' ');
                    if (tokenTypes.includes('inline-code') && (nodeContent.startsWith(EMERA_INLINE_JS_PREFIX) || nodeContent.startsWith(EMERA_INLINE_JSX_PREFIX))) {
                        toProcess.push({
                            type: nodeContent.startsWith(EMERA_INLINE_JS_PREFIX) ? 'inline-js' : 'inline-jsx',
                            startNode: node.node,
                            endNode: node.node,
                            content: nodeContent,
                            cursorInside: isCursorOnSameLineWithNode(state, node, node),
                        });
                    }

                    const lineTypes = ((node.type.prop(lineClassNodeProp) as string) || '').split(' ');
                    const isFenceStart = lineTypes.includes('HyperMD-codeblock-begin');
                    const isFenceEnd = lineTypes.includes('HyperMD-codeblock-end');
                    const containstEmeraSpecifier = nodeContent.trim().endsWith(EMERA_JSX_LANG_NAME) || nodeContent.trim().includes(`${EMERA_JSX_SHORTHAND_LANG_NAME}:`) || nodeContent.trim().endsWith(EMERA_JS_LANG_NAME);

                    if (isFenceStart && containstEmeraSpecifier && !currentBlockStartNode) {
                        currentBlockStartNode = node.node;
                        currentBlockStartType = nodeContent.trim().endsWith(EMERA_JS_LANG_NAME) ? 'block-js' : 'block-jsx';
                    } else if (isFenceEnd && currentBlockStartNode) {
                        const text = state.doc.sliceString(currentBlockStartNode.from, node.to).trim();

                        const regex = new RegExp(`([\`~]{3,})(?:${EMERA_JS_LANG_NAME}|(?:${EMERA_JSX_LANG_NAME}|${EMERA_JSX_SHORTHAND_LANG_NAME}):?(\\S+)?)\\n([\\s\\S]+)\\n\\1`);
                        const match = regex.exec(text);

                        if (match) {
                            const componentSpecifier = match[2];
                            const code = match[3]

                            toProcess.push({
                                type: currentBlockStartType!,
                                startNode: currentBlockStartNode,
                                endNode: node.node,
                                content: code,
                                cursorInside: isCursorBetweenNodes(state, currentBlockStartNode, node),
                                shortcutComponent: componentSpecifier ?? undefined,
                            });
                        }

                        currentBlockStartNode = null;
                        currentBlockStartType = null;
                    }
                },
            });

            if (toProcess.length === 0) {
                return {
                    decorations: builder.finish(),
                    cache: [],
                };
            }

            console.log('[EDITOR] Will process nodes', toProcess);
            const pageScope = getPageScope(parent.plugin, file);
            // console.log('[EDITOR] Disposing page scope descendants', pageScope.id);
            // pageScope.disposeDescendants();

            const cache: PluginState["cache"] = [];
            let shouldForceCached = false;
            let shouldReevaluate = false;
            let readScope = pageScope;

            console.log('Old cache', oldState.cache);
            console.log('To Process', toProcess);
            toProcess.forEach((el, index) => {
                const cacheEntry = oldState.cache[index];
                if (el.cursorInside) {
                    shouldForceCached = true;
                }
                const renderKey = iife(() => {
                    const randomKey = Math.random().toString();
                    if (cacheEntry && cacheEntry.cursorInside && !el.cursorInside) {
                        if (cacheEntry.type === 'block-js' || el.type === 'block-js') {
                            shouldReevaluate = true;
                        }
                        return randomKey;
                    };
                    if (shouldForceCached) return cacheEntry?.key ?? randomKey;
                    if (!cacheEntry || shouldReevaluate) return randomKey;
                    if (cacheEntry.type === el.type && cacheEntry.content === el.content) return cacheEntry.key;

                    if (cacheEntry.type === 'block-js' || el.type === 'block-js') {
                        shouldReevaluate = true;
                        return randomKey;
                    }

                    return randomKey;
                });

                console.log('Record', index, el.type, 'render key', renderKey, `(old key ${cacheEntry?.key})`);


                cache.push({
                    type: el.type,
                    content: el.content,
                    key: renderKey,
                    cursorInside: el.cursorInside,
                });

                let writeScope = getScope(`page/${file.path}/${index}`);
                if (!writeScope) {
                    writeScope = new ScopeNode(`page/${file.path}/${index}`);
                    readScope.addChild(writeScope);
                }

                if (shouldReevaluate && !shouldForceCached) {
                    // console.log('Resetting write scope');
                    writeScope.reset();
                }

                if (el.cursorInside) {
                    // We still want to create scope and all, but not render actual component
                    return;
                }

                const ctx = {
                    file,
                    mode: 'edit',
                    index,
                    total: toProcess.length,
                    shortcutComponent: el.shortcutComponent,
                    readScope,
                    writeScope,
                } as const;
                // TODO: it will be good to re-use React roots so widgets will be able to preserve state between renders
                const widget = iife(() => {
                    if (el.type === 'inline-js') return new parent.InlineJsWidget(renderKey, el.content, ctx);
                    if (el.type === 'inline-jsx') return new parent.InlineJsxWidget(renderKey, el.content, ctx);
                    if (el.type === 'block-js') return new parent.BlockJsWidget(renderKey, el.content, ctx);
                    if (el.type === 'block-jsx') return new parent.BlockJsxWidget(renderKey, el.content, ctx);
                });
                const isInline = el.type.startsWith('inline');
                const decorationStart = Math.max(isInline ? el.startNode.from : el.startNode.from - 1, 0);
                const decorationEnd = isInline ? el.endNode.to : el.endNode.to + 1;
                console.log('[EDITOR] Adding decoration', decorationStart, decorationEnd, widget);
                builder.add(
                    decorationStart,
                    decorationEnd,
                    Decoration.replace({ widget })
                );
                readScope = writeScope;
            });

            console.log('New cache', cache);
            return {
                decorations: builder.finish(),
                cache,
            };
        };

        return StateField.define<PluginState>({
            create(state): PluginState {
                const initialState = processCodeblocks({ editorState: state });
                console.log('Code processor initial state', initialState);
                return initialState;
            },

            update(oldState: PluginState, transaction: Transaction): PluginState {
                return processCodeblocks({
                    oldState,
                    transaction
                });
            },

            provide(field: StateField<PluginState>) {
                return EditorView.decorations.from(field, f => f.decorations);
            },
        });
    });
}
