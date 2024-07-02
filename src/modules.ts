import { EMERA_MODULES } from "./consts";
import * as react from 'react';
import * as fm from 'framer-motion';
import * as sc from 'styled-components';
import * as reactDom from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import { Markdown } from "./Markdown";
import { useEmeraContext } from "./context";

// @ts-ignore
window[EMERA_MODULES] = {
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
