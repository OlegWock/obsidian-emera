import { rollup, type Plugin as RollupPlugin } from '@rollup/browser';
import { normalizePath, Notice } from 'obsidian';
import * as Babel from '@babel/standalone';
import { ReactNode } from 'react';
import type { EmeraPlugin } from './plugin';
import { EMERA_GET_SCOPE, EMERA_MODULES } from './consts';
import { getScope, ScopeNode } from './scope';

// @ts-ignore not included in package types, but it's there!
const t = Babel.packages.types;

const someGlobalVars = new Set([
    'window', 'self', 'globalThis', 'document', 'console', 'app',

    // Not really globals, but due to how Babel works, our plugin might replace those
    // before react plugin will add related imports, so we explicitly ignore them
    '_jsx', '_Fragment', '_jsxs',
]);

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

                const ignoredPrefixes = ['.', 'http://', 'https://'];
                if (!ignoredPrefixes.some(p => source.startsWith(p))) {
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

function scopeRewriter() {
    function isStandaloneOrFirstInChain(path: any) {
        const parent = path.parent;

        if (t.isMemberExpression(parent)) {
            return parent.object === path.node;
        }

        if (t.isOptionalMemberExpression(parent)) {
            return parent.object === path.node;
        }

        return true;
    }

    function isPartOfObjectPattern(path: any) {
        const scopeBlock = path.scope.block;
        if (t.isProgram(scopeBlock) || t.isBlockStatement(scopeBlock)) {
            for (const statement of scopeBlock.body) {
                if (t.isVariableDeclaration(statement)) {
                    for (const declarator of statement.declarations) {
                        if (t.isObjectPattern(declarator.id)) {
                            for (const property of declarator.id.properties) {
                                if (
                                    t.isObjectProperty(property) &&
                                    t.isIdentifier(property.key) &&
                                    property.key.name === path.node.name &&
                                    t.isIdentifier(property.value) &&
                                    property.value.name !== path.node.name
                                ) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    function isIdentifierReExported(path: any): boolean {
        const program = path.findParent((p: any) => p.isProgram());

        if (!program) return false;

        return program.node.body.some((node: any) => {
            if (t.isExportNamedDeclaration(node) && node.source) {
                return node.specifiers.some((specifier: any) => {
                    if (t.isExportSpecifier(specifier)) {
                        return (
                            (t.isIdentifier(specifier.exported) && specifier.exported.name === path.node.name) ||
                            (t.isIdentifier(specifier.local) && specifier.local.name === path.node.name)
                        );
                    }
                    return false;
                });
            }
            return false;
        });
    }

    function isObjectKey(identifierPath: any): boolean {
        const parent = identifierPath.parentPath;

        if (parent.isObjectProperty()) {
            return parent.node.key === identifierPath.node && !parent.node.computed;
        }

        return false;
    }

    function isPartOfTypeofUndefinedCheck(nodePath: any) {
        const path = nodePath.type ? nodePath : nodePath.get('expression');

        // Check if it's not an Identifier
        if (path.node.type !== 'Identifier') {
            return false;
        }

        let parentPath = path.parentPath;

        // Check if it's the operand of a typeof operator
        if (parentPath &&
            parentPath.isUnaryExpression({ operator: 'typeof' })) {
            return true;
        }

        // Check if it's the alternate of a ConditionalExpression (ternary)
        if (parentPath && parentPath.isConditionalExpression() && parentPath.node.alternate === path.node) {
            const test = parentPath.node.test;
            if (!test || test.type !== 'BinaryExpression' || (test.operator !== '===' && test.operator !== '==')) return false;
            const isUnary = (node: any) => node.type === "UnaryExpression" && node.operator === 'typeof' && node.argument.type === 'Identifier' && node.argument.name === path.node.name;
            const isUndefined = (node: any) => node.type === 'StringLiteral' && node.value === 'undefined';

            return (isUnary(test.left) && isUndefined(test.right)) || (isUnary(test.right) && isUndefined(test.left));
        }

        return false;
    }

    function isPartOfScopeHasCheck(path: any, identifierName: string) {
        // Check if the identifier is part of a conditional expression
        const conditionalExpression = path.findParent((p: any) => p.isConditionalExpression());
        if (!conditionalExpression) return false;

        // Check the structure of the test part of the conditional
        const test = conditionalExpression.get("test");
        if (!test.isCallExpression()) return false;

        const callee = test.get("callee");
        if (!callee.isMemberExpression()) return false;

        // Check if it matches window._emeraGetScope("test").has("<identifier>")
        if (
            callee.get("object").get('callee').matchesPattern(`window.${EMERA_GET_SCOPE}`) &&
            callee.get("property").isIdentifier({ name: "has" }) &&
            test.get("arguments")[0].isStringLiteral({ value: identifierName })
        ) {
            const consequent = conditionalExpression.get("consequent");
            if (
                consequent.isCallExpression() &&
                consequent.get("callee").isMemberExpression() &&
                consequent.get("callee").get("object").get('callee').matchesPattern("window._emeraGetScope") &&
                consequent.get("callee").get("property").isIdentifier({ name: "get" }) &&
                consequent.get("arguments")[0].isStringLiteral({ value: identifierName })
            ) {
                // Check the alternate part
                const alternate = conditionalExpression.get("alternate");
                return alternate.isIdentifier({ name: identifierName });
            }
        }

        return false;
    }

    return {
        // Need to run this last

        visitor: {
            Identifier(path: any, state: any) {
                const scope = state.opts.scope as ScopeNode;

                const name = path.node.name;

                const firstIdentifier = isStandaloneOrFirstInChain(path);
                if (!firstIdentifier) return;
                if (!path.isReferencedIdentifier()) return;
                if (someGlobalVars.has(name)) return;

                const binding = path.scope.getBinding(name);
                if (binding) return;

                if (isPartOfObjectPattern(path)) return;
                if (isIdentifierReExported(path)) return;
                if (isObjectKey(path)) return;
                if (isPartOfTypeofUndefinedCheck(path)) return;
                if (isPartOfScopeHasCheck(path, name)) return;

                const replacement = t.parenthesizedExpression(
                    t.conditionalExpression(
                        t.callExpression(
                            t.memberExpression(
                                t.callExpression(
                                    t.memberExpression(
                                        t.identifier('window'),
                                        t.identifier(EMERA_GET_SCOPE)
                                    ),
                                    [t.stringLiteral(scope.id)]
                                ),
                                t.identifier('has')
                            ),
                            [t.stringLiteral(name)]
                        ),
                        t.callExpression(
                            t.memberExpression(
                                t.callExpression(
                                    t.memberExpression(
                                        t.identifier('window'),
                                        t.identifier(EMERA_GET_SCOPE)
                                    ),
                                    [t.stringLiteral(scope.id)]
                                ),
                                t.identifier('get')
                            ),
                            [t.stringLiteral(name)]
                        ),
                        t.identifier(name)
                    )
                );

                // console.log('Replacing node with');
                // @ts-ignore
                // console.log(Babel.packages.generator.default(replacement).code);

                path.replaceWith(replacement);

            },
        }
    };
}
Babel.registerPlugin("scopeRewriter", scopeRewriter);

type TranspileCodeOptions = {
    rewriteImports?: boolean
    scope?: ScopeNode,
};

export const transpileCode = (
    code: string,
    { rewriteImports = true, scope }: TranspileCodeOptions = {}) => {
    const transpiled = Babel.transform(code, {
        sourceType: "unambiguous",
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
            ...(rewriteImports ? [Babel.availablePlugins["importRewriter"]] : []),
            [Babel.availablePlugins["scopeRewriter"], { scope: scope ?? getScope('root') }],
        ],
    }).code;
    if (!transpiled) {
        throw new Error('Babel failed :(');
    }
    // console.log('Original', code);
    // console.log(transpiled);
    return transpiled;
};

// @ts-ignore
window.transpileCode = transpileCode;

const rollupVirtualFsPlugin = (plugin: EmeraPlugin, path: string): RollupPlugin => ({
    name: 'virtualFs',
    async resolveId(source, importer) {
        if (source === path) {
            return source;
        }

        if (importer && (source.startsWith('./') || source.startsWith('../'))) {
            const resolvedPath = resolvePath(importer, source);
            const extensions = ['.js', '.jsx', '.ts', '.tsx', '.css'];

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

export const importFromString = (code: string, ignoreCache = true) => {
    if (ignoreCache) {
        code = `// Cache buster: ${Math.random()}\n\n` + code;
    }
    const encodedCode = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
    return import(encodedCode);
};


export const compileJsxIntoFactory = async (jsx: string, scope?: ScopeNode): Promise<() => ReactNode> => {
    const source = `export default () => {
        return (<>${jsx}</>);
    };`;
    // console.log('====== Scope', scope);
    // console.log('====== Original JSX');
    // console.log(jsx);
    const transpiled = transpileCode(source, {
        scope,
    });
    // console.log('====== Compiled JSX code');
    // console.log(transpiled);
    const { default: factory } = await importFromString(transpiled);
    return factory;
};

export const loadUserModule = async (plugin: EmeraPlugin): Promise<Record<string, any>> => {
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
    console.log('Loading index file', indexFile);

    try {
        const bundledCode = await bundleFile(plugin, indexFile);
        const registry = await importFromString(bundledCode);
        return registry;
    } catch (err) {
        new Notice("Error happened while loading components: " + err.toString());
        return {};
    }
};
