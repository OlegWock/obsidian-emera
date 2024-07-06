import { rollup, type Plugin as RollupPlugin } from '@rollup/browser';
import { normalizePath, TFile } from 'obsidian';
import * as Babel from '@babel/standalone';
import { ComponentType } from 'react';
import type { EmeraPlugin } from './plugin';
import { EMERA_COMPONENTS_REGISTRY, EMERA_MODULES } from './consts';

// @ts-ignore not included in package types, but it's there!
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
                    if (t.isIdentifier(firstArg)) {
                        const binding = path.scope.getBinding(firstArg.name);
                        if (!binding && !['_Fragment', 'Fragment'].includes(firstArg.name)) {
                            path.node.arguments[0] = t.memberExpression(
                                t.identifier(`window.${EMERA_COMPONENTS_REGISTRY}`),
                                firstArg
                            );
                        }
                    } else if (t.isMemberExpression(firstArg)) {
                        let currentNode = firstArg;
                        const parts = [];
                        while (t.isMemberExpression(currentNode)) {
                            parts.unshift(currentNode.property.name);
                            currentNode = currentNode.object;
                        }
                        if (t.isIdentifier(currentNode)) {
                            parts.unshift(currentNode.name);
                        }

                        if (parts[0] === `window.${EMERA_COMPONENTS_REGISTRY}`) {
                            return;
                        }

                        const binding = path.scope.getBinding(parts[0]);
                        if (!binding) {
                            const newExpression = parts.reduce((acc, part, index) => {
                                return t.memberExpression(
                                    index === 0 ? t.identifier(`window.${EMERA_COMPONENTS_REGISTRY}`) : acc,
                                    t.identifier(part)
                                );
                            }, null);
                            path.node.arguments[0] = newExpression;
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
};

const rollupVirtualFsPlugin = (plugin: EmeraPlugin, path: string): RollupPlugin => ({
    name: 'virtualFs',
    async resolveId(source, importer) {
        if (source === path) {
            return source;
        }

        if (importer && (source.startsWith('./') || source.startsWith('../'))) {
            const resolvedPath = resolvePath(importer, source);
            const extensions = ['.js', '.jsx', '.ts', '.tsx', '.css' ];

            if (extensions.some(ext => resolvedPath.endsWith(ext))) {
                return resolvedPath;
            }

            for (const ext of extensions) {
                const pathWithExt = `${resolvedPath}${ext}`;
                const exists = await plugin.app.vault.adapter.exists(pathWithExt);
                if (exists) {
                    return pathWithExt;
                }
            }
        }

        return null;
    },
    async load(id) {
        const exists = await plugin.app.vault.adapter.exists(id);
        if (!exists) {
            return null;
        }
        return plugin.app.vault.adapter.read(id);
    }
});

const rollupBabelPlugin = (plugin: EmeraPlugin): RollupPlugin => ({
    name: 'babel-plugin',
    transform(code, id) {
        return { code: transpileCode(code) };
    }
});

const rollupCssPlugin = (plugin: EmeraPlugin): RollupPlugin => ({
    name: 'emera-styles',
    transform(code, id) {
        if (!id.endsWith('.css')) return;

        const injectionCode = `
          (function() {
            var style = document.createElement('style');
            style.textContent = ${JSON.stringify(code)};
            document.head.appendChild(style);
          })();
        `;

        return { code: injectionCode };
    }
});

export const bundleFile = async (plugin: EmeraPlugin, path: string) => {
    console.log('Bundling', path);
    const bundle = await rollup({
        input: path,
        plugins: [
            rollupVirtualFsPlugin(plugin, path),
            rollupCssPlugin(plugin),
            rollupBabelPlugin(plugin),
        ]
    })
    const { output } = await bundle.generate({ format: 'es' });
    // console.log('Bundled code');
    // console.log(output[0].code);
    await bundle.close();
    return output[0].code;
};

export const importFromString = (code: string) => {
    const encodedCode = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
    return import(encodedCode);
};

export const compileJsxIntoComponent = async (jsx: string): Promise<ComponentType<{}>> => {
    const source = `export default () => (<>${jsx}</>);`;
    // console.log('Original JSX');
    // console.log(jsx);
    const transpiled = transpileCode(source, true);
    // console.log('Compiled JSX code');
    // console.log(transpiled);
    const { default: component } = await importFromString(transpiled);
    return component;
};

export const loadComponents = async (plugin: EmeraPlugin): Promise<Record<string, ComponentType<any>>> => {
    const extensions = ['js', 'jsx', 'ts', 'tsx'];
    let indexFile: string | null = null;
    for (const ext of extensions) {
        const path = normalizePath(`${plugin.settings.componentsFolder}/index.${ext}`);
        const exists = await plugin.app.vault.adapter.exists(path);
        if (exists) {
            indexFile = path;
            break;
        }
    }
    if (!indexFile) {
        console.log('Index file not found');
        return {};
    }

    // TODO: this might fail silently (with just error in console) if user tries, for example, importing unsupported file type
    const bundledCode = await bundleFile(plugin, indexFile);

    // TODO: and this might fail if user tries to import global module
    // that isn't provided by Emera. We'll need to show some notice at least.
    const registry = await importFromString(bundledCode);
    return registry;
};
