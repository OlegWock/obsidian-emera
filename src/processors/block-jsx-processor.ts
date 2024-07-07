import { SyntaxNodeRef } from "@lezer/common";
import { UniversalMdProcessor, UniversalProcessorContext } from "./universal-md-processor";
import { EMERA_INLINE_JSX_PREFIX, EMERA_JSX_LANG_NAME } from "../consts";
import { compileJsxIntoComponent } from "../bundler";
import { renderComponent } from "../renderer";
import { LoadingInline } from "../components/LoadingInline";
import { ErrorAlert } from "../components/ErrorBoundary";
import { iife } from "../utils";
import { Root } from "react-dom/client";
import { getPageScope } from "../scope";
import { EmptyBlock } from "../components/EmptyBlock";

export class BlockJsxProcessor extends UniversalMdProcessor {
    previewBaseSelector = 'pre > code';
    editorModeOfOperation = 'range' as const;
    inline = false;

    cache: Record<string, Record<string, string>> = {};

    shouldProcessPreviewElement(element: Element): boolean {
        return element.classList.contains('language-emera');
    }

    shouldProcessEditorNode(node: SyntaxNodeRef, content: string): false | 'start' | 'end' {
        if ((node.type.name.includes('HyperMD-codeblock-begin') || node.type.name.includes('formatting-code-block_hmd-codeblock')) && content.trim().endsWith(EMERA_JSX_LANG_NAME)) {
            return 'start';
        }
        if (node.type.name.includes('HyperMD-codeblock-end') || node.type.name.includes('formatting-code-block_hmd-codeblock')) {
            return 'end';
        }
        return false;
    }

    async process(wrapper: HTMLElement, content: string, ctx: UniversalProcessorContext) {
        wrapper.classList.add('emera-block-jsx');


        const code = iife(() => {
            if (content.startsWith('```') && content.endsWith('```')) return content.split('\n').slice(1, -1).join('\n').trim();
            return content;
        });
        console.log('Processing JSX block');
        console.log(code);

        // TODO: this should be cached
        // TODO: react to components reload
        if (code) {
            try {
                const scope = getPageScope(this.plugin, ctx.file);
                let container: Element | Root = wrapper;
                if (!this.plugin.isComponentsLoaded) {
                    container = renderComponent({
                        component: LoadingInline,
                        container: wrapper,
                        plugin: this.plugin,
                        context: {
                            file: ctx.file,
                        },
                    });
                    await this.plugin.componentsLoadedPromise;
                }

                const component = await compileJsxIntoComponent(code, scope);
                scope.onChange(async () => {
                    renderComponent({
                        component,
                        container,
                        plugin: this.plugin,
                        context: {
                            file: ctx.file,
                        },
                    });
                });
                container = renderComponent({
                    component,
                    container,
                    plugin: this.plugin,
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


    }
}

