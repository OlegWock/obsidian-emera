import { ComponentType, createElement, ReactNode } from "react";
import { EmeraContextProvider, EmeraContextType } from "./emera-module/context";
import { createRoot, Root } from "react-dom/client";
import type { EmeraPlugin } from './plugin';
import { ErrorBoundary } from "./components/ErrorBoundary";

export type RenderComponentParams<P extends Record<string, any>> = {
    container: Element | Root,
    component: ComponentType<P>,
    plugin: EmeraPlugin,
    children?: ReactNode,
    context: Omit<EmeraContextType, 'plugin' | 'storage' | 'frontmatter' | 'app'>,
    props?: P
};

export const renderComponent = <P extends Record<string, any>>({ component, container, plugin, context, children, props }: RenderComponentParams<P>) => {
    let root: Root;
    if (container instanceof Element) {
        container.classList.add('emera-root');
        root = createRoot(container);
    } else {
        root = container;
    }

    const frontmatter = context.file ? plugin.app.metadataCache.getFileCache(context.file)?.frontmatter : undefined;
    root.render(
        createElement(EmeraContextProvider, {
            value: {
                ...context,
                plugin,
                app: plugin.app,
                storage: plugin.storage,
                frontmatter,
            },
        },
            createElement(ErrorBoundary, {},
                createElement(component, props, children)
            )
        )
    );

    return root;
};
