import { MarkdownRenderer } from 'obsidian';
import { ComponentProps, useEffect, useRef } from "react";
import { useEmeraContext } from './context';
import { mergeRefs } from "react-merge-refs";

export const Markdown = ({ children, ref, as: Component = 'div', ...props }: { children: string, as: string } & Omit<ComponentProps<"div">, "children">) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const ctx = useEmeraContext();

    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        MarkdownRenderer.render(
            ctx.plugin.app,
            children,
            containerRef.current,
            ctx.file?.path ?? '',
            ctx.plugin,
        );
    }, []);

    // @ts-ignore
    return <Component {...props} data-emera-markdown ref={mergeRefs([containerRef, ref])}></Component>;
};
