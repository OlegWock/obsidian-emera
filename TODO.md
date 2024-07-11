
* Document what global and page scopes contain
* Update docs about what modules we expose and what's inside context

* Consider exposing modules in scopes too (in addition to overwriting imports)
* Or maybe even refactor `EMERA_MODULES` to be just a variable (e.g. `modules`) inside the scope, instead of separate object and then just overwrite imports to unpack from `modules` variable.

* JS code blocks with `export` should create their own scope (based on previous' block scope or page scope) and all other elements (inline js and block/inline jsx) should use latest scope instead of page one.

* Allow user export `config` from `index.js` with field `customMarkdownProcessors` containing array of 'UniversalMarkdown' processors to make it easy to replace built-in elements (like links) with components.

* When codeblock in rendered right after heading (on next line) in live preview it still gets pased as part of heading which screws styles.

* In live preview widgets sometimes (seemingly randomly) switch between rendering as text and widgets

* Maybe auto-detect hardcoded paths in snippets and update them if user renames/moves mentioned file?

* Research maybe there is a way to bundle single declarations file for all modules we export. So user will be able to copy/symlink it to their project and have at least code completion and typechecking.

* Check if there is library for this already or make our own with React hooks for Obsidian
