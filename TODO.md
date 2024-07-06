* Check that it works on mobile
* Expose frontmatter to inline JS and components
* JS code blocks with `export` should make variable available in page's scope

* Reduce size effort
    * Babel and Sass each take around 5MB, which is a lot when whole build is around 11mb
    * Check if we can use esbuild-wasm to compile user's code and drop Babel. Might give us a performance improvement too. But I'll need to port Rollup and Babel plugins to esbuild
    * Consider dropping sass, as it makes really big part of a bundle
