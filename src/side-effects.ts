import * as react from 'react';
import * as fm from 'framer-motion';
import * as sc from 'styled-components';
import * as reactDom from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import { Markdown } from "./Markdown";
import { useEmeraContext } from "./context";
import { EMERA_COMPONENTS_REGISTRY, EMERA_JSX_LANG_NAME, EMERA_MD_LANG_NAME, EMERA_MODULES } from "./consts";

// Add syntax highlight for emera
const CodeMirror = (window as any).CodeMirror;
if ((EMERA_JSX_LANG_NAME as string) !== 'jsx') {
    CodeMirror.defineMode(EMERA_JSX_LANG_NAME, (config: any) => CodeMirror.getMode(config, 'jsx'));
    CodeMirror.defineMIME(`text/x-${EMERA_JSX_LANG_NAME}`, 'jsx');
}

CodeMirror.defineMode(EMERA_MD_LANG_NAME, (config: any) => CodeMirror.getMode(config, 'markdown'));
CodeMirror.defineMIME(`text/x-${EMERA_MD_LANG_NAME}`, 'markdown');

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
