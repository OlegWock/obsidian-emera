import { SyntaxNodeRef } from "@lezer/common";
import { UniversalMdProcessor, UniversalProcessorContext } from "./universal-md-processor";
import { EMERA_INLINE_JSX_PREFIX, EMERA_JSX_LANG_NAME } from "../consts";
import { compileJsxIntoComponent } from "../bundler";
import { renderComponent } from "../renderer";
import { LoadingInline } from "../components/LoadingInline";
import { ErrorAlert } from "../components/ErrorBoundary";
import { Root } from "react-dom/client";
import { getPageScope } from "../scope";
import { EmptyBlock } from "../components/EmptyBlock";
import { ComponentType } from "react";

export class BlockJsxProcessor extends UniversalMdProcessor {
    previewBaseSelector = 'pre';
    editorModeOfOperation = 'range' as const;
    inline = false;

    cache: Record<string, Record<string, string>> = {};

    shouldProcessPreviewElement(element: Element): boolean {
        const child = element.firstChild;
        if (!child) return false;
        return child.nodeType === Node.ELEMENT_NODE && (child as Element).className.includes(`language-${EMERA_JSX_LANG_NAME}`);
    }

    shouldProcessEditorNode(node: SyntaxNodeRef, content: string): false | 'start' | 'end' {
        // console.log('Should process node', node.type.name, content);
        const isFenceStart = node.type.name.includes('HyperMD-codeblock-begin') || node.type.name.includes('formatting-code-block_hmd-codeblock');
        const containstEmeraSpecifier = content.trim().endsWith(EMERA_JSX_LANG_NAME) || content.trim().includes(`${EMERA_JSX_LANG_NAME}:`);
        if (isFenceStart && containstEmeraSpecifier) {
            return 'start';
        }
        if (node.type.name.includes('HyperMD-codeblock-end') || node.type.name.includes('formatting-code-block_hmd-codeblock')) {
            return 'end';
        }
        return false;
    }

    async process(wrapper: HTMLElement, content: string, ctx: UniversalProcessorContext) {
        wrapper.classList.add('emera-block-jsx');

        let componentSpecifier: string | undefined;
        let code: string;

        if (ctx.mode === 'edit') {
            const regex = new RegExp(`(?:\`{3,}${EMERA_JSX_LANG_NAME}(?:\\n|:(\\S+)\\n)([\\s\\S]+)\\n\`{3,})|(?:~{3,}${EMERA_JSX_LANG_NAME}(?:\\n|:(\\S+)\\n)([\\s\\S]+)\\n~{3,})`);
            const match = regex.exec(content);
            if (!match) return;

            componentSpecifier = match[1] || match[3];
            code = match[2] || match[4];
        } else {
            code = content;
            const regex = new RegExp(`language-${EMERA_JSX_LANG_NAME}:([\\S]+)`);
            const codeEl = ctx.originalPreviewElement.firstChild as Element;
            const match = regex.exec(codeEl.className);
            componentSpecifier = match?.[1];
        }

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

                let component: ComponentType<any>;
                if (componentSpecifier) {
                    component = scope.get(componentSpecifier);
                } else {
                    component = await compileJsxIntoComponent(code, scope);
                }
                scope.onChange(async () => {
                    renderComponent({
                        component,
                        container,
                        plugin: this.plugin,
                        children: componentSpecifier ? code : undefined,
                        context: {
                            file: ctx.file,
                        },
                    });
                });
                container = renderComponent({
                    component,
                    container,
                    plugin: this.plugin,
                    children: componentSpecifier ? code : undefined,
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

