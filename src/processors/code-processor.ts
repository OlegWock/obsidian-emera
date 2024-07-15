import type { SyntaxNode } from '@lezer/common';
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
import { MarkdownPostProcessorContext, TFile, MarkdownView } from 'obsidian';
import { EmeraPlugin } from '../plugin';
import { iife } from '../utils';
import { emeraCurrentEditorStateField, findCurrentView, isCursorBetweenNodes } from './utils';
import { EMERA_INLINE_JS_PREFIX, EMERA_INLINE_JSX_PREFIX, EMERA_JS_LANG_NAME, EMERA_JSX_LANG_NAME } from '../consts';
import { getPageScope, getScope, ScopeNode } from '../scope';
import { compileJsxIntoComponent, importFromString, transpileCode } from '../bundler';
import { renderComponent } from '../renderer';
import { LoadingInline } from '../components/LoadingInline';
import { Root } from 'react-dom/client';
import { ComponentType } from 'react';
import { ErrorAlert } from '../components/ErrorBoundary';
import { EmptyBlock } from '../components/EmptyBlock';
import { JsBlockPlaceholder } from '../components/JsBlockPlaceholder';


type ProcessorContext = {
    file: TFile,
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

const redecorateTrigger = StateEffect.define<null>();

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

            const component = await compileJsxIntoComponent(code, ctx.readScope);
            await ctx.readScope.waitForUnblock();
            // console.log('Processing inline JSX', code);
            // console.log('Compiled into', component);
            // console.log('Using scope', ctx.readScope, { ...ctx.readScope.scope });
            renderComponent({
                component,
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
        renderComponent({
            component: JsBlockPlaceholder,
            container: wrapper,
            plugin: this.plugin,
            context: {
                file: ctx.file,
            },
        });

        const transpiled = transpileCode(code, { scope: ctx.readScope });
        const id = Math.round(Math.random() * 1000);
        console.log(id, 'Waiting for scope to execute', transpiled);
        await ctx.readScope.waitForUnblock();
        console.log(id, 'Scope unblocked');
        const module = await importFromString(transpiled);
        console.log(id, 'Exported members to be added to scope', { ...module });
        ctx.writeScope.reset();
        ctx.writeScope.setMany(module);
        console.log(id, 'Unblocking write scope');
        ctx.writeScope.unblock();
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

                let component: ComponentType<any>;
                await this.plugin.componentsLoadedPromise;
                await ctx.readScope.waitForUnblock();

                if (ctx.shortcutComponent) {
                    component = ctx.readScope.get(ctx.shortcutComponent);
                } else {
                    component = await compileJsxIntoComponent(content, ctx.readScope);
                }

                container = renderComponent({
                    component,
                    container,
                    plugin: this.plugin,
                    children: ctx.shortcutComponent ? content : undefined,
                    context: {
                        file: ctx.file,
                    },
                });
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
                wrapper.addEventListener('click', (e) => {
                    e.preventDefault();
                    view.dispatch({
                        selection: { anchor: view.posAtDOM(wrapper) },
                        scrollIntoView: true
                    });
                });
                func(wrapper, this.content, this.ctx);
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
                const pageScope = getPageScope(this.plugin, file);
                await pageScope.waitForUnblock();
                console.log('[PREVIEW] Disposing page scope descendants');
                pageScope.disposeDescendants();

                let readScope = pageScope;
                queue.filter(el => {
                    let isRenderingPage = false;
                    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
                        // @ts-ignore
                        if (leaf.view && leaf.view instanceof MarkdownView) {
                            if (leaf.view.contentEl.contains(el.el)) isRenderingPage = true;
                        }
                    });

                    return isRenderingPage;
                }).forEach((el, index, arr) => {
                    let writeScope = getScope(`page/${file.path}/${index}`);
                    if (writeScope) {
                        writeScope.dispose();
                    }
                    writeScope = new ScopeNode(`page/${file.path}/${index}`);
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
            file: TFile,
            queue: ToProcessPreviewRecord[],
        }> = {};

        let processingRequested = false;

        return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            if (el.dataset.emeraMarkdown) {
                // This is content from our <Markdown /> component, we don't want to process it
                return;
            }

            const file = this.plugin.app.vault.getFileByPath(ctx.sourcePath)!;
            const code = Array.from(el.querySelectorAll('code'));
            const toProcess = code.flatMap((el): ToProcessPreviewRecord[] => {
                const content = el.textContent ?? '';
                if (el.parentElement?.tagName.toLowerCase() === 'pre') {
                    // Multi-line code block
                    if (el.className.includes(`language-${EMERA_JSX_LANG_NAME}`)) {
                        const regex = new RegExp(`language-${EMERA_JSX_LANG_NAME}:([\\S]+)`);
                        const match = regex.exec(el.className);
                        const componentSpecifier = match?.[1];
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

            if (!queueMap[file.path]) {
                queueMap[file.path] = {
                    file,
                    queue: [],
                };
            }
            queueMap[file.path].queue.push(...toProcess);
            if (!processingRequested) {
                setTimeout(() => processQueue(), 10);
                processingRequested = true;
                console.log('Scheduled queue processing');
            }
        };
    });

    // TODO: currently, if user moves cursor to JS block, it will break any subsequent block that uses variables from 
    // this block. We need to keep track if such block is edited and either render placeholder on subsequent blocks or 
    // just use older values to render the components
    codemirrorStateField = iife(() => {
        const parent = this;
        type PluginState = {
            decorations: DecorationSet,
            cache: { type: string, content: string, key: string, cursorInside: boolean }[],
        };
        return StateField.define<PluginState>({
            create(state): PluginState {
                return {
                    decorations: Decoration.none,
                    cache: [],
                };
            },
            update(oldState: PluginState, transaction: Transaction): PluginState {
                // console.log('Transaction', transaction);
                const builder = new RangeSetBuilder<Decoration>();
                const state = transaction.state;

                const manualRefresh = transaction.effects.some(effect => effect.is(redecorateTrigger));
                const importantUpdate = manualRefresh || transaction.docChanged;
                if (!importantUpdate && !transaction.selection) {
                    return oldState;
                }

                const editor = state.field(emeraCurrentEditorStateField);
                if (!editor) {
                    console.log(`[EDITOR] Can't get editor view, skipping`);
                    return {
                        decorations: builder.finish(),
                        cache: [],
                    };
                }

                const mdView = findCurrentView(parent.plugin, editor);
                if (!mdView) {
                    console.log(`[EDITOR] Can't find current view, skipping`);
                    return {
                        decorations: builder.finish(),
                        cache: [],
                    };
                }

                const mdViewState = mdView.getState();
                // Don't do anything in Source mode, we care only about LivePreview
                if (mdViewState.mode === 'source' && mdViewState.source) {
                    console.log(`[EDITOR] Editor in source mode, skipping`);
                    return {
                        decorations: builder.finish(),
                        cache: [],
                    };
                }

                const file = mdView?.file;
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

                        if (node.type.name.startsWith('inline-code') && (nodeContent.startsWith(EMERA_INLINE_JS_PREFIX) || nodeContent.startsWith(EMERA_INLINE_JSX_PREFIX))) {
                            toProcess.push({
                                type: nodeContent.startsWith(EMERA_INLINE_JS_PREFIX) ? 'inline-js' : 'inline-jsx',
                                startNode: node.node,
                                endNode: node.node,
                                content: nodeContent,
                                cursorInside: isCursorBetweenNodes(state, node, node),
                            });
                        }

                        const isFenceStart = node.type.name.includes('HyperMD-codeblock-begin');
                        const isFenceEnd = node.type.name.includes('HyperMD-codeblock-end');
                        const containstEmeraSpecifier = nodeContent.trim().endsWith(EMERA_JSX_LANG_NAME) || nodeContent.trim().includes(`${EMERA_JSX_LANG_NAME}:`) || nodeContent.trim().endsWith(EMERA_JS_LANG_NAME);

                        if (isFenceStart && containstEmeraSpecifier && !currentBlockStartNode) {
                            currentBlockStartNode = node.node;
                            currentBlockStartType = nodeContent.trim().endsWith(EMERA_JS_LANG_NAME) ? 'block-js' : 'block-jsx';
                        } else if (isFenceEnd && currentBlockStartNode) {
                            const text = state.doc.sliceString(currentBlockStartNode.from, node.to).trim();

                            const regex = new RegExp(`([\`~]{3,})(?:${EMERA_JS_LANG_NAME}|${EMERA_JSX_LANG_NAME}:?(\\S+)?)\\n([\\s\\S]+)\\n\\1`);
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
                    const widget = iife(() => {
                        if (el.type === 'inline-js') return new parent.InlineJsWidget(renderKey, el.content, ctx);
                        if (el.type === 'inline-jsx') return new parent.InlineJsxWidget(renderKey, el.content, ctx);
                        if (el.type === 'block-js') return new parent.BlockJsWidget(renderKey, el.content, ctx);
                        if (el.type === 'block-jsx') return new parent.BlockJsxWidget(renderKey, el.content, ctx);
                    });
                    const isInline = el.type.startsWith('inline');
                    builder.add(
                        isInline ? el.startNode.from : el.startNode.from - 1,
                        isInline ? el.endNode.to : el.endNode.to + 1,
                        Decoration.replace({ widget })
                    );
                    readScope = writeScope;
                });

                console.log('New cache', cache);
                return {
                    decorations: builder.finish(),
                    cache,
                };
            },

            provide(field: StateField<PluginState>) {
                return EditorView.decorations.from(field, f => f.decorations);
            },
        });
    });
}
