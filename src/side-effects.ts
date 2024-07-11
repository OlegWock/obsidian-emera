import { EMERA_GET_SCOPE, EMERA_JS_LANG_NAME, EMERA_JSX_LANG_NAME, EMERA_MODULES, EMERA_ROOT_SCOPE } from "./consts";
import { registerCodemirrorMode } from './editor';
import { exposedModules } from "./exposed-modules";
import { getScope, ScopeNode } from './scope';

// Add syntax highlight for emera
registerCodemirrorMode(EMERA_JSX_LANG_NAME, 'jsx');
registerCodemirrorMode(EMERA_JS_LANG_NAME, 'javascript');

// Expose modules
(window as any)[EMERA_MODULES] = new Proxy({
    ...exposedModules,
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
