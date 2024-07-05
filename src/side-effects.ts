import * as obsidian from 'obsidian';
import * as react from 'react';
import * as fm from 'framer-motion';
import * as sc from 'styled-components';
import * as reactDom from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import { emeraModule } from './emera-module';

import { EMERA_COMPONENTS_REGISTRY, EMERA_JS_LANG_NAME, EMERA_JSX_LANG_NAME, EMERA_MODULES, EMERA_SCOPES } from "./consts";
import { registerCodemirrorMode } from './codemirror';
import type { ComponentType } from 'react';

// Add syntax highlight for emera
registerCodemirrorMode(EMERA_JSX_LANG_NAME, 'jsx');
registerCodemirrorMode(EMERA_JS_LANG_NAME, 'js');

// Expose modules
(window as any)[EMERA_MODULES] = {
    emera: emeraModule,
    react,
    obsidian,
    'react/jsx-runtime': jsxRuntime,
    'react-dom': reactDom,
    'framer-motion': fm,
    'styled-components': sc,
};

(window as any)[EMERA_SCOPES] = {};
(window as any)[EMERA_COMPONENTS_REGISTRY] = new Proxy({} as Record<string, ComponentType<any>>, {
    get(target, p: string, receiver) {
        const component = Reflect.get(target, p, receiver);
        if (!component) {
            throw new Error(`You're trying to render component ${p}, but it's missing from registry. Make sure you exported it from you index.js file.`)
        }
        return component;
    },
});
