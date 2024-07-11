import * as obsidian from 'obsidian';
import * as react from 'react';
import * as fm from 'framer-motion';
import * as jotai from 'jotai';
import * as jotaiUtils from 'jotai/utils';
import * as reactDom from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import * as emera from './emera-module';

export const exposedModules = {
    emera,
    react,
    obsidian,
    jotai,
    'jotai/utils': jotaiUtils,
    'react/jsx-runtime': jsxRuntime,
    'react-dom': reactDom,
    'framer-motion': fm,
};
