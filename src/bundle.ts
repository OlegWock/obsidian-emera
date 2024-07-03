import { rollup } from '@rollup/browser';
import { TFile } from 'obsidian';
import type EmeraPlugin from '../main';

import * as Babel from '@babel/standalone';
import { EMERA_COMPONENTS_REGISTRY, EMERA_MODULES } from './consts';
import { ComponentType } from 'react';

// @ts-ignore type this
const t = Babel.packages.types;

function resolvePath(base: string, relative: string) {
    const stack = base.split('/');
    const parts = relative.split('/');
    stack.pop(); // remove current file name (or empty string)

    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '.') continue;
        if (parts[i] === '..') stack.pop();
        else stack.push(parts[i]);
    }
    return stack.join('/');
}

function importRewriter() {
    return {
        visitor: {
            ImportDeclaration(path: any) {
                const source = path.node.source.value;

                if (!source.startsWith('.') && !source.startsWith('/')) {
                    const specifiers = path.node.specifiers;

                    const properties = specifiers.map((specifier: any) => {
                        if (t.isImportSpecifier(specifier)) {
                            if (specifier.imported.name === specifier.local.name) {
                                return t.objectProperty(
                                    t.identifier(specifier.imported.name),
                                    t.identifier(specifier.local.name),
                                    false,
                                    true
                                );
                            } else {
                                return t.objectProperty(
                                    t.identifier(specifier.imported.name),
                                    t.identifier(specifier.local.name)
                                );
                            }
                        } else if (t.isImportDefaultSpecifier(specifier)) {
                            return t.objectProperty(
                                t.identifier('default'),
                                t.identifier(specifier.local.name)
                            );
                        }
                    });

                    const destructuring = t.variableDeclaration("const", [
                        t.variableDeclarator(
                            t.objectPattern(properties),
                            t.memberExpression(
                                t.memberExpression(t.identifier('window'), t.identifier(EMERA_MODULES)),
                                t.stringLiteral(source),
                                true
                            )
                        )
                    ]);

                    path.replaceWith(destructuring);
                }
            }
        }
    };
}
Babel.registerPlugin("importRewriter", importRewriter);

function jsxNamespacer() {
    return {
        visitor: {
            CallExpression(path: any) {
                if (['_jsxs', '_jsx'].includes(path.node.callee.name)) {
                    const firstArg = path.node.arguments[0];
                    if (t.isIdentifier(firstArg) && !['_Fragment', 'Fragment'].includes(firstArg.name)) {

                        const binding = path.scope.getBinding(firstArg.name);
                        if (!binding) {
                            path.node.arguments[0] = t.memberExpression(
                                t.identifier(`window.${EMERA_COMPONENTS_REGISTRY}`),
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

export const transpileCode = (code: string, patchJsxNamespace = false) => {
    const transpiled = Babel.transform(code, {
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
            Babel.availablePlugins["importRewriter"],
            ...(patchJsxNamespace ? [Babel.availablePlugins["jsxNamespacer"]] : []),
        ],
    }).code;
    if (!transpiled) {
        throw new Error('Babel failed :(');
    }
    return transpiled;
}

export const bundleFile = async (plugin: EmeraPlugin, file: TFile) => {
    console.log('Bundling', file.path);
    const bundle = await rollup({
        input: file.path,
        plugins: [
            {
                name: 'virtualFs',
                resolveId(source, importer) {
                    if (source === file.path) {
                        return source;
                    }

                    if (importer && (source.startsWith('./') || source.startsWith('../'))) {
                        const resolvedPath = resolvePath(importer, source);
                        const extensions = ['.js', '.jsx', '.ts', '.tsx'];

                        if (extensions.some(ext => resolvedPath.endsWith(ext))) {
                            return resolvedPath;
                        }

                        for (const ext of extensions) {
                            const pathWithExt = `${resolvedPath}${ext}`;
                            const file = plugin.app.vault.getFileByPath(pathWithExt);
                            if (file) {
                                return pathWithExt;
                            }
                        }
                    }

                    return null;
                },
                load(id) {
                    const file = plugin.app.vault.getFileByPath(id);
                    if (!file) {
                        return null;
                    }
                    return plugin.app.vault.read(file);
                }
            },
            {
                name: 'babel-plugin',
                transform(code, id) {
                    return { code: transpileCode(code) };
                }
            }
        ]
    })
    const { output } = await bundle.generate({ format: 'es' });

    await bundle.close();
    return output[0].code;
};

export const importFromString = (code: string) => {
    const encodedCode = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
    return import(encodedCode);
};

export const compileJsxIntoComponent = async (jsx: string) => {
    const source = `export default () => (<>${jsx}</>);`;
    const transpiled = transpileCode(source, true);
    console.log(transpiled);
    const { default: component } = await importFromString(transpiled);
    return component;
};

export const loadComponents = async (plugin: EmeraPlugin): Promise<Record<string, ComponentType<any>>> => {
    const extensions = ['js', 'jsx', 'ts', 'tsx'];
    let indexFile: TFile | null = null;
    for (const ext of extensions) {
        indexFile = plugin.app.vault.getFileByPath(`${plugin.settings.componentsFolder}/index.${ext}`);
        if (indexFile) break;
    }
    if (!indexFile) {
        console.log('Index file not found');
        return {};
    }

    const bundledCode = await bundleFile(plugin, indexFile);
    // console.log('Bundled code');
    // console.log(bundledCode);
    const registry = await importFromString(bundledCode);
    return registry;
};
