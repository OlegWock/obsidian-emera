* Expose frontmatter to inline JS

It makes sense to implement more generic 'scopes' solution, rather than making special cases for `frontmatter` property. This also will come handy when I get to local exports support.

How this could work:

✅ When transpiling code, Babel will rewrite access to any `<indentifier>` without binding (except `window.<identifier>`, `self.<identifier>`, `globalThis.<identifier>`, etc.) into access to `window_emeraScopes[<scopeId>].<identifier>`. `_emeraScopes` will be simple object storing scopes for different code blocks. 

✅ Scope is object which holds values for idenifiers available for current code block. Scopes should be stackable. If current scope can't find requested property, it will invoke parent scope until property isn't found. When user tries to access property that can't be found anywhere in chain, it will throw readable exception. 

✅ There will be special, global scope which will be root scope. From it there will be page scope and then code block scopes.

Populating global and page scopes should be relatively easy and values there will rarely change. Code block scopes might be a bit harder to manage though.

What should be in global scope:
* plugin instance

What should be in page scope:
* Current page file
* Frontmatter


In any case, if something in scope changes, we need to re-evaluate every codeblock who has access to it (so go down the scope tree).

Scope might change:

* From outside, case for global and page scopes
* We re-evaluated code block (e.g. user edited it). We won't keep track if exported variables really changed, we just re-evaluate all children codeblocks.

It's clear that scopes should be modelled as tree data structure. Namely we'll need to be able easily 

* Go down (when re-evaluating blocks)
* Go up (for lookup)
* Get scope by id (for initial call from user's code)

---

* JS code blocks with `export` should make variable available in page's scope
