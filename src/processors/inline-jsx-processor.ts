import { SyntaxNodeRef } from "@lezer/common";
import { UniversalMdProcessor, UniversalProcessorContext } from "./universal-md-processor";
import { EMERA_INLINE_JSX_PREFIX } from "../consts";
import { compileJsxIntoComponent } from "../bundler";
import { renderComponent } from "../renderer";
import { LoadingInline } from "../components/LoadingInline";
import { getPageScope } from "../scope";

export class InlineJsxProcessor extends UniversalMdProcessor {
    previewBaseSelector = 'code';
    inline = true;

    cache: Record<string, Record<string, string>> = {};

    shouldProcessPreviewElement(element: Element): boolean {
        return element.parentElement?.tagName !== 'PRE' && !!element.textContent?.startsWith(EMERA_INLINE_JSX_PREFIX);
    }

    shouldProcessEditorNode(node: SyntaxNodeRef, content: string): boolean {
        if (!node.type.name.startsWith('inline-code')) return false;
        return content.startsWith(EMERA_INLINE_JSX_PREFIX);
    }

    async process(wrapper: HTMLElement, content: string, ctx: UniversalProcessorContext) {
        const code = content.slice(EMERA_INLINE_JSX_PREFIX.length);
        wrapper.classList.add('emera-inline-jsx');

        console.log('Processing inline JSX', code);
        // TODO: this should be cached
        // TODO: react to components reload
        try {
            const scope = getPageScope(this.plugin, ctx.file);
            const reactRoot = renderComponent({
                component: LoadingInline,
                container: wrapper,
                plugin: this.plugin,
                context: {
                    file: ctx.file,
                },
            });

            await this.plugin.componentsLoadedPromise;

            const component = await compileJsxIntoComponent(code, scope);
            await scope.waitForUnblock();
            
            renderComponent({
                component,
                container: reactRoot,
                plugin: this.plugin,
                context: {
                    file: ctx.file,
                },
            });
            scope.onChange(async () => {
                renderComponent({
                    component,
                    container: reactRoot,
                    plugin: this.plugin,
                    context: {
                        file: ctx.file,
                    },
                });
            });
        } catch (err) {
            console.error(err);
            wrapper.textContent = `❗️${err.toString()}`;
        }
    }
}

