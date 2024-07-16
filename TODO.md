* Document what global and page scopes contain
* Update docs about what modules we expose and what's inside context

* Consider exposing modules in scopes too (in addition to overwriting imports)
* Or maybe even refactor `EMERA_MODULES` to be just a variable (e.g. `modules`) inside the scope, instead of separate object and then just overwrite imports to unpack from `modules` variable.

* Allow user export `config` from `index.js` with field `customMarkdownProcessors` containing array of 'UniversalMarkdown' processors to make it easy to replace built-in elements (like links) with components.

* Bug: when codeblock in rendered right after heading (on next line) in live preview it still gets pased as part of heading which screws styles.

* Bug: in live preview widgets sometimes (seemingly randomly) switch between rendering as text and widgets. Similarly, decorations doesn't get removed when editor switches to source mode.

* Maybe auto-detect hardcoded paths in snippets and update them if user renames/moves mentioned file?

* Research maybe there is a way to bundle single declarations file for all modules we export. So user will be able to copy/symlink it to their project and have at least code completion and typechecking.

* Check if there is library for this already or make our own with React hooks for Obsidian

* Self-modifying components? Or in broader sense, note content modifying. So data used inside component can live near it (in neighbouring code block for example) and component will be able to update it programatically.

* Consider using (or providing option to) Shadow DOM to avoid theme/other plugin styles messing with components
