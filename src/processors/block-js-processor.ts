import { SyntaxNodeRef } from "@lezer/common";
import { UniversalMdProcessor, UniversalProcessorContext } from "./universal-md-processor";
import { EMERA_JS_LANG_NAME } from "../consts";
import { importFromString, transpileCode } from "../bundler";
import { renderComponent } from "../renderer";
import { getPageScope } from "../scope";
import { JsBlockPlaceholder } from "../components/JsBlockPlaceholder";

export class BlockJsProcessor extends UniversalMdProcessor {
    previewBaseSelector = 'pre';
    editorModeOfOperation = 'range' as const;
    inline = false;

    cache: Record<string, Record<string, string>> = {};

    shouldProcessPreviewElement(element: Element): boolean {
        const child = element.firstChild;
        if (!child) return false;
        return child.nodeType === Node.ELEMENT_NODE && (child as Element).className.includes(`language-${EMERA_JS_LANG_NAME}`);
    }

    shouldProcessEditorNode(node: SyntaxNodeRef, content: string): false | 'start' | 'end' {
        // console.log('Should process node', node.type.name, content);
        const isFenceStart = node.type.name.includes('HyperMD-codeblock-begin') || node.type.name.includes('formatting-code-block_hmd-codeblock');
        const containstEmeraSpecifier = content.trim().endsWith(EMERA_JS_LANG_NAME);
        if (isFenceStart && containstEmeraSpecifier) {
            return 'start';
        }
        if (node.type.name.includes('HyperMD-codeblock-end') || node.type.name.includes('formatting-code-block_hmd-codeblock')) {
            return 'end';
        }
        return false;
    }

    async process(wrapper: HTMLElement, content: string, ctx: UniversalProcessorContext) {
        wrapper.classList.add('emera-block-js');
        let code: string;

        if (ctx.mode === 'edit') {
            code = content.split('\n').slice(1, -1).join('\n');
        } else {
            code = content;
        }

        renderComponent({
            component: JsBlockPlaceholder,
            container: wrapper,
            plugin: this.plugin,
            context: {
                file: ctx.file,
            },
        });

        // Currently this dumps everything in page scope. Which might lead to errors, if code depends on order of execution
        // Usually, it should be in somewhat correct order, but who knows, so
        // TODO: rewrite this to use separate scope for each block
        // But this ^^ might require merging all 4 processors into one big processor to allow us to iterate over
        // all blocks and inline code/jsx and keep track of latest scope

        const pageScope = getPageScope(this.plugin, ctx.file);
        if (ctx.index === 0) pageScope.block();

        const transpiled = transpileCode(code, { scope: pageScope });
        const module = await importFromString(transpiled);
        console.log('Exported members to be added to scope', module);
        pageScope.setMany(module);
        if (ctx.index === ctx.total - 1) pageScope.unblock();
    }
}

