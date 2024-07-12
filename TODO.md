* Optimizations for editor plugin
    * if user edits outside code blocks -> we render decorations with updated positions, but don't re-evaluate them (reuse previous result/element)
    * if user edits any inline code or block jsx -> we should re-evaluate/re-render only this block, rest should be reused from cache
    * if user edits block js code -> we should re-evaluate all dependent widgets

    * For these optimizations to work correctly we should be able to match blocks from old document to new one. Since code blocks don't have any kind of permanent id, we're a bit limited in this regards. However, on best effort basis this algorithm should work relatively well.
        1. When walking document first time, save info about code blocks in order they appear (type, content)
        2. When walking over document after update, on each code element compare it with element from the cache on same index. 
            * If type changed from block-js -> stop working with cache, do full re-evaluate for every further widget
            * If type changed to block-js -> stop working with cache, do full re-evaluate for every further widget
            * If type remained block-js but content changed -> stop working with cache, do full re-evaluate for every further widget
            * If type or content changed in any other way -> re-evaluate only this component and continue with cache
            * If nothing changed -> do nothing


* Document what global and page scopes contain
* Update docs about what modules we expose and what's inside context

* Consider exposing modules in scopes too (in addition to overwriting imports)
* Or maybe even refactor `EMERA_MODULES` to be just a variable (e.g. `modules`) inside the scope, instead of separate object and then just overwrite imports to unpack from `modules` variable.

* Allow user export `config` from `index.js` with field `customMarkdownProcessors` containing array of 'UniversalMarkdown' processors to make it easy to replace built-in elements (like links) with components.

* When codeblock in rendered right after heading (on next line) in live preview it still gets pased as part of heading which screws styles.

* In live preview widgets sometimes (seemingly randomly) switch between rendering as text and widgets

* Maybe auto-detect hardcoded paths in snippets and update them if user renames/moves mentioned file?

* Research maybe there is a way to bundle single declarations file for all modules we export. So user will be able to copy/symlink it to their project and have at least code completion and typechecking.

* Check if there is library for this already or make our own with React hooks for Obsidian
