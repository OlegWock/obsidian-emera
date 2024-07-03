import * as react from 'react';
import * as fm from 'framer-motion';
import * as sc from 'styled-components';
import * as reactDom from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import { Markdown } from "./Markdown";
import { useEmeraContext } from "./context";
import { EMERA_COMPONENTS_REGISTRY, EMERA_JSX_LANG_NAME, EMERA_MODULES } from "./consts";
import { registerCodemirrorMode } from './codemirror';

// Add syntax highlight for emera
registerCodemirrorMode(EMERA_JSX_LANG_NAME, 'jsx');

// Expose modules
(window as any)[EMERA_MODULES] = {
    emera: {
        Markdown,
        useEmeraContext,
    },
    react,
    'react/jsx-runtime': jsxRuntime,
    'react-dom': reactDom,
    'framer-motion': fm,
    'styled-components': sc,
};

(window as any)[EMERA_COMPONENTS_REGISTRY] = {};
