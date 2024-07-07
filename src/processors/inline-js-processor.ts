import { SyntaxNodeRef } from "@lezer/common";
import { UniversalMdProcessor, UniversalProcessorContext } from "./universal-md-processor";
import { EMERA_INLINE_JS_PREFIX } from "../consts";
import { importFromString, transpileCode } from "../bundler";
import { getPageScope } from "../scope";

export class InlineJsProcessor extends UniversalMdProcessor {
    previewBaseSelector = 'code';
    inline = true;

    cache: Record<string, Record<string, string>> = {};

    shouldProcessPreviewElement(element: Element): boolean {
        return element.parentElement?.tagName !== 'PRE' && !!element.textContent?.startsWith(EMERA_INLINE_JS_PREFIX);
    }

    shouldProcessEditorNode(node: SyntaxNodeRef, content: string): boolean {
        if (!node.type.name.startsWith('inline-code')) return false;
        return content.startsWith(EMERA_INLINE_JS_PREFIX);
    }

    async process(wrapper: HTMLElement, content: string, ctx: UniversalProcessorContext) {
        const code = content.slice(EMERA_INLINE_JS_PREFIX.length);
        wrapper.classList.add('emera-inline-js');
        let evaluated: any;
        if (!this.cache[ctx.file.path]) {
            this.cache[ctx.file.path] = {};
        }
        if (this.cache[ctx.file.path][code]) {
            evaluated = this.cache[ctx.file.path][code];
        } else {
            try {
                console.log('Evaluating inline js', content);
                const scope = getPageScope(this.plugin, ctx.file);

                const transpiled = transpileCode(`export default () => ${code}`, {
                    rewriteImports: false,
                    rewriteUnbindedJsxComponents: false,
                    scope,
                });
                console.log('Transiped into');
                console.log(transpiled);
                const module = await importFromString(transpiled);
                scope.onChange(async () => {
                    let evaluated;
                    try {
                        evaluated = await module.default();
                    } catch (err) {
                        console.error(err);
                        evaluated = `❗️${err.toString()}`;
                    }
                    this.cache[ctx.file.path][code] = evaluated;
                    wrapper.textContent = evaluated;
                });
                evaluated = await module.default();
            } catch (err) {
                console.error(err);
                evaluated = `❗️${err.toString()}`;
            }
            this.cache[ctx.file.path][code] = evaluated;
        }

        wrapper.textContent = evaluated;
    }

}
