import { ComponentType, createElement, ReactNode } from "react";
import { EmeraContextProvider, EmeraContextType } from "./emera-module/context";
import { createRoot, Root } from "react-dom/client";
import type { EmeraPlugin } from './plugin';
import { ErrorBoundary } from "./components/ErrorBoundary";

export type RenderComponentParams<P extends Record<string, any>> = {
    container: HTMLElement | Root,
    component: ComponentType<P>,
    plugin: EmeraPlugin,
    children?: ReactNode,
    context: Omit<EmeraContextType, 'plugin' | 'storage'>,
    props?: P
};

export const renderComponent = <P extends Record<string, any>>({ component, container, plugin, context, children, props }: RenderComponentParams<P>) => {
    let root: Root;
    if (container instanceof HTMLElement) {
        container.classList.add('emera-root');
        root = createRoot(container);
    } else {
        root = container;
    }

    root.render(
        createElement(EmeraContextProvider, {
            value: {
                ...context,
                plugin,
                storage: plugin.storage,
            },
        },
            createElement(ErrorBoundary, {},
                createElement(component, props, children)
            )
        )
    );

    return root;
};
