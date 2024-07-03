const CodeMirror = (window as any).CodeMirror;


export const registerCodemirrorMode = (name: string, original: string) => {
    CodeMirror.defineMode(name, (config: any) => CodeMirror.getMode(config, original));
    CodeMirror.defineMIME(`text/x-${name}`, 'jsx');
};
