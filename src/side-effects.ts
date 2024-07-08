import * as obsidian from 'obsidian';
import * as react from 'react';
import * as fm from 'framer-motion';
import * as jotai from 'jotai';
import * as jotaiUtils from 'jotai/utils';
import * as reactDom from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import { emeraModule } from './emera-module';

import { EMERA_GET_SCOPE, EMERA_JS_LANG_NAME, EMERA_JSX_LANG_NAME, EMERA_MODULES, EMERA_ROOT_SCOPE } from "./consts";
import { registerCodemirrorMode } from './editor';
import { getScope, ScopeNode } from './scope';

// Add syntax highlight for emera
registerCodemirrorMode(EMERA_JSX_LANG_NAME, 'jsx');
registerCodemirrorMode(EMERA_JS_LANG_NAME, 'javascript');

// Expose modules
(window as any)[EMERA_MODULES] = new Proxy({
    emera: emeraModule,
    react,
    obsidian,
    jotai,
    'jotai/utils': jotaiUtils,
    'react/jsx-runtime': jsxRuntime,
    'react-dom': reactDom,
    'framer-motion': fm,
}, {
    get(target, p: string, receiver) {
        const module = Reflect.get(target, p, receiver);
        if (!module) {
            throw new Error(`You're trying to import module ${p}, but it isn't available. You can only use small number of `
                + `pre-selected modules with Emera, refer to the documentation to see which modules are available`);
        }
        return module;
    },
});

(window as any)[EMERA_ROOT_SCOPE] = new ScopeNode('root');
(window as any)[EMERA_GET_SCOPE] = getScope;
