import { rollup } from '@rollup/browser';
import { TFile } from 'obsidian';
import type EmeraPlugin from '../main';


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

export const bundleFile = async (plugin: EmeraPlugin, file: TFile) => {
    const bundle = await rollup({
        input: file.path,
        plugins: [
            {
                name: 'virtualFs',
                resolveId(source, importer) {
                    // Check if it's the entry point
                    if (source === file.path) {
                        return source;
                    }

                    if (importer && (source.startsWith('./') || source.startsWith('../'))) {
                        const resolvedPath = resolvePath(importer, source);
                        const extensions = ['.js', '.jsx', '.ts', '.tsx'];

                        if (extensions.some(ext => resolvedPath.endsWith(ext))) {
                            return resolvedPath;
                        }

                        // If no extension, try appending each supported extension
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
            }
        ]
    })
    const { output } = await bundle.generate({ format: 'es' });

    await bundle.close();
    return output[0].code;
};
