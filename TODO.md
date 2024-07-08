
* Document what global and page scopes contain
* Consider exposing modules in scopes too (in addition to overwriting imports)
* Or maybe even refactor `EMERA_MODULES` to be just a variable (e.g. `modules`) inside the scope, instead of separate object and then just overwrite imports to unpack from `modules` variable.

* JS code blocks with `export` should create their own scope (based on previous' block scope or page scope) and all other elements (inline js and block/inline jsx) should use latest scope instead of page one.
