import { TFile } from "obsidian";
// import { transform as babelTransform, availablePresets, registerPlugin as babelRegisterPlugin, availablePlugins, types as t } from '@babel/standalone';
import * as Babel from '@babel/standalone';
import type EmeraPlugin from "../main";
import * as react from 'react';
import * as reactdom from 'react-dom';
import * as sc from 'styled-components';
import * as fm from 'framer-motion';
import { useEmeraContext } from "./context";
import { Markdown } from "./Markdown";

// @ts-ignore type this
const t = Babel.packages.types;

export const getComponentFiles = (plugin: EmeraPlugin) => {
    const files = plugin.app.vault.getFiles().filter(file => {
        return file.path.startsWith(plugin.settings.componentsFolder) && file.path.endsWith('.component.jsx');
    });
    return files;
};

// Simple plugin that converts every identifier to "LOL"
function jsxNamespacer() {
    return {
        visitor: {
            CallExpression(path: any) {
                if (path.node.callee.name === '_jsx') {
                    const firstArg = path.node.arguments[0];
                    if (t.isIdentifier(firstArg) && !['_Fragment', 'Fragment'].includes(firstArg.name)) {

                        const binding = path.scope.getBinding(firstArg.name);
                        if (!binding) {
                            path.node.arguments[0] = t.memberExpression(
                                t.identifier('window._emeraComponentRegistry'),
                                firstArg
                            );
                        }
                    }
                }
            }
        },
    };
}
Babel.registerPlugin("jsxNamespacer", jsxNamespacer);

function jsxImportRewriter() {
    return {
        visitor: {
            ImportDeclaration(path: any) {
                if (path.node.source.value === 'react/jsx-runtime') {
                    const specifiers = path.node.specifiers.map((specifier: any) => {
                        let key, value;
                        if (t.isImportSpecifier(specifier)) {
                            key = specifier.imported.name;
                            value = specifier.local.name;
                        } else {
                            key = value = specifier.local.name;
                        }
                        return t.objectProperty(
                            t.identifier(key),
                            t.identifier(value),
                            false,
                            key === value
                        );
                    });

                    const destructuring = t.variableDeclaration('const', [
                        t.variableDeclarator(
                            t.objectPattern(specifiers),
                            t.memberExpression(
                                t.identifier('window'),
                                t.identifier('_emeraJsxRuntime')
                            )
                        )
                    ]);

                    path.replaceWith(destructuring);
                }
            }
        }
    };
}
Babel.registerPlugin("jsxImportRewriter", jsxImportRewriter);

const transpileCode = (code: string) => {
    let transpiledCode = Babel.transform(code, {
        presets: [
            [
                Babel.availablePresets['react'],
                {
                    runtime: "automatic",
                }
            ],
            [
                Babel.availablePresets['typescript'],
                {
                    onlyRemoveTypeImports: true,
                    allExtensions: true,
                    isTSX: true
                }
            ]
        ],
        plugins: [
            Babel.availablePlugins["jsxNamespacer"],
            Babel.availablePlugins["jsxImportRewriter"],
        ],
    }).code;

    if (!transpiledCode) {
        throw new Error(`couldn't transpile code`);
    }

    console.log('Transpiled into');
    console.log(transpiledCode);
    return transpiledCode;
};

export const importFromString = (code: string) => {
    const encodedCode = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
    return import(encodedCode);
}

export const compileJsxIntoComponent = async (jsx: string) => {
    const source = `export default () => (<>${jsx}</>);`;
    const transpiled = transpileCode(source);
    console.log(transpiled);
    const { default: component } = await importFromString(transpiled);
    return component;
}

export const compileComponent = async (plugin: EmeraPlugin, file: TFile) => {
    const rawContent = await plugin.app.vault.cachedRead(file);
    const transpiledCode = transpileCode(rawContent);

    let component = null;
    try {
        const factory = (await importFromString(transpiledCode)).default;
        // TODO: check that factory is a function
        const emeraObject = {
            modules: {
                react,
                reactdom,
                sc,
                fm,
            },
            components: {
                Markdown,
            },
            importCss: (path: string) => {
                // TODO: implement this
            },
            vault: plugin.app.vault,
            useEmeraContext,
        };
        component = factory(emeraObject);
    } catch (e) {
        console.error(e);
        throw new Error(`couldn't evaluate component from ${file.path}`);
    }

    if (!component) {
        throw new Error(`component missing in ${file.path}`);
    }

    const descriptor = {
        name: file.basename.replace(/\.component$/, ''),
        code: transpiledCode,
        component,
    }

    return descriptor;
};
