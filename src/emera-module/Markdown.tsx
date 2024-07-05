import { App, MarkdownRenderer } from 'obsidian';
import { useEffect, useRef } from "react";
import { useEmeraContext } from './context';

export const Markdown = ({children}: {children: string}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const ctx = useEmeraContext();

    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        MarkdownRenderer.render(
            ctx.plugin.app,
            children,
            containerRef.current,
            ctx.file.path,
            ctx.plugin,
        );
    }, []);
    return <div ref={containerRef}></div>;
};
