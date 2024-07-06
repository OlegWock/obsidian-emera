# Emera for Obsidian

This is a plugin for Obsidian (https://obsidian.md) which enables you to use react components and inline JavaScript directly in your notes.

![Screenshot](/.github/screenshot.png)

---

* [Features](#features)
* [Roadmap](#roadmap)
* [How to install](#how-to-install)
* [How to use](#how-to-use)
    * [Supported features](#supported-features)
    * [Limitations](#limitations)
    * [Available modules](#available-modules)
    * [Emera module](#emera-module)
* [How it works](#how-it-works)
* [Reporting bugs, proposing features, and other contributions](#reporting-bugs-proposing-features-and-other-contributions)
* [Support development / say thanks](#support-development--say-thanks)


## Features

* Embed React components as blocks or inline with text.
* Convenient shorthand syntax for markdown formatting components (think `<Callout />).
* Full-fledged JSX for more complex usecases.
* Inline JS execution (in progress).
* Supports both reading and live preview modes.
* Components are loaded from JS files, so you can use your favorite editor.
* Emera supports TypeScript, ES modules (local only), and importing CSS/SASS files. 

## Roadmap

* Support for mobile
* Accessing frontmatter in components and inline js
* Share variables between code blocks on same page. So you could do something like:
````markdown
```emjs
export const two = 2;
export const five = 5;
```
````

And later on same page ```emjs:two+five``` which will be evaluated to `7`.

* Support for canvas

## How to install

Emera isn't available in Obsidian plugin catalog (at least yet). To install Emera you need to download zip file from latest release and unpack it into `<your vault>/.obisdian/plugins/emera` and enable it in Obsidian's settings.

## How to use

After you install and enable Emera, you can configure your components folder. By default it's `Components` folder in root of your vault.

> [!NOTE]  
> You can change the components folder, but it can't start with dot (e.g. `.components`), as plugins don't have access to hidden folders.

Create file `index.js` in your components folder and put example components there:

```jsx
import { Markdown } from 'emera';

export const HelloWorld = ({ name = 'World' }) => {
    return (<div>Hello, {name}!</div>);
};

export const HelloWorldInline = ({ name = 'World' }) => {
    return (<span>Hello, {name}!</span>);
};

export const RedCallout = ({ children }) => {
    return (<div style={{ padding: 20, border: '2px solid red' }}>
        <Markdown>{children}</Markdown>
    </div>);
};
```

Then go to Emera's settings and refresh components. Now you can use your `HelloWorld` and `HelloWorldInline` components in your notes. Components can be embedded either inline, or as a block.

To render component inline, add ```emera:<HelloWorldInline name="Obsidian" />```. Everything after `emera:` will be parsed as JSX, so you can set props, add children elements, etc.

To render component as block, there are two syntaxes. Shorthand syntax is convenient if your component acts as a simple wrapper (e.g. `<Callout />` kind of component). You add it by creating codeblock with language ```Em<Name of your component>```

````markdown
```EmRedCallout
You can use **Markdown** inside `<RedCallout />`.
```
````

When using shorthand syntax, content of codeblock isn't parsed as JSX, but passed directly to the component as string. This allows to preserve any formatting, and later correctly render it with `<Markdown />` component.

And for more complex cases there is support for JSX. JSX is automatically wrapped in Fragment, so you can add multiple siblings to same block.

````markdown
```emera
<HelloWorld name="Obsidian" />
<HelloWorld name="Emera" />
```
````

JavaScript evaluation is still in development and fairly limited. Currently it's only possible to evaluate inline JS, like this: ```emjs:new Date()```. Inline JS evaluated in global scope, so you can access, for example, `window.app`, but code doesn't have access to any of your exported functions/components.

### Supported features

* You can split your code in multiple files

Emera cares only about entrypoint (`index.js` file). As long as you export something from it, it will be available in Obsidian. But beyond that, you can organize your code however you want and use `import/export` to expose desired components.

* You can use TypeScript

You probably wouldn't want to do this, as there is no type definitions (and you can't install them, see [limitations](#limitations)), but if you really want – you can.

* Import CSS/SASS files

Imported files will be injected into page. But, unfortunately, no CSS modules support.


### Limitations

I tried to make working with Emera as easy as possible, but there are still a few constraints you need to keep in mind.

* You can't use external modules

Most notably, you can't use external modules (ones installed with NPM or imported directly by URL). If you're interested as to why, check out [How it works](#how-it-works) section. However, you can import local files, so if you download required library and place it in components folder – you can import it (as long as library itself doesn't import any other external library). Emera provides a couple of modules out of the box, see [Available modules](#available-modules).

* You can't use built-in modules

Emera code is executed in browser environment, which means you won't have access to built-in Node packages either.

### Available modules

Emera allows you to import selected set of external modules. If you want to propose package for inclusion, open issue. But note that package shouldn't be too big and should be useful for wide range of users.

Currently emera exposes these modules

* `emera` – see [Emera module](#emera-module).
* `react` – version 19.
* `react-dom` – version 19, without `react-dom/client` and other submodules.
* `obsidian` – module available to plugins, see [Obisdian docs](https://docs.obsidian.md/Home).
* `framer-motion` – animations library, see [Framer Motion docs](https://www.framer.com/motion/).
* `jotai` and `jotai/utils` – state management library, see [Jotai docs](https://jotai.org/).

### Emera module

Emera exposes couple of components, hooks, and functions which might be useful when building components for Obsidian.

* `<Markdown />` component – this component allows you to render markdown using Obsidian's renderer. Props are same as for ordinary `div` with that expection that `children` should be string.

* `useEmeraContext()` hook – exposes emera-related data and functions. Currently exposes only `file`, which describes file in which component is rendered, and `storage`, which allows you to access plugin-wide storage (uses Jotai under the hood, see [storage.ts](/src/emera-module/storage.ts) for API).

* `useStorage<T>(key: string, defaultValue: T)` hook – allows you to have persisted plugin-wide state. Returned value is same as in `useState` hook.


## How it works

Emera works completely in browser environment, without access to Node. This was done to ensure that plguin can be compatible with Obsidian on mobile devices. However, this also places quite a lot of limitations.

When you launch Obsidian, Emera will try to transpile and bundle your plugins. This step allows you to use TypeScript, import CSS directly, and most importantly use JSX. To do so, we use special builds of [Rollup](https://rollupjs.org/faqs/#how-do-i-run-rollup-itself-in-a-browser) and [Babel](https://babeljs.io/docs/babel-standalone) which can work in browser environment. However, many Babel and Rollup plugins still require Node environment, so Emera also includes implementations of virtual filesystem, styles loader, and own intergration with Babel. 

Once code is bundled, Emera will execute it and save any exported functions and components into registry (which is just global variable on `window`). Similarly, modules provided by Emera are stored in global variable too. To make everything work together, Emera provides a couple of custom Babel plugins which overwrite `import` statement in your code to get modules from global variable instead, as well as substitute components in your JSX with components from registry (so `<Hello />` becomes `<window._emeraRegistry.Hello />`).

With components loaded, Emera will register a couple of handlers to render them on pages. Namely

* [Code block post processor](https://docs.obsidian.md/Reference/TypeScript+API/MarkdownPreviewRenderer/createCodeBlockPostProcessor) to render block components in both reading and live preview mode.
* [Editor extension](https://docs.obsidian.md/Plugins/Editor/Editor+extensions) to render inline JS and components in live preview mode.
* [Markdown post processor](https://docs.obsidian.md/Reference/TypeScript+API/MarkdownPreviewRenderer/registerPostProcessor) to render inline JS and components in reading mode.

## Reporting bugs, proposing features, and other contributions

This is a project I do for myself and mostly because it's just fun, I love programming. I'm making this public and open-source in case there are people who might find it useful. I definetely would like to find something like this, so I wouldn't need to do most things from scratch. So, here it is, use as you please.

_I, in fact, found [obsidian-react-components](https://github.com/elias-sundqvist/obsidian-react-components/) which helped me to understand how such kind of plugin would work, as I'm still relatively new to Obsidian._

But with that being said, I run my projects as I find comfortable. So, feel free to report a bug or a feature, but there is a very slim chance I will fix/add it, unless it's a critical bug or really cool feature that I'll use myself. If you want to contribute code, please open an issue first, describing what you plan to do (unless it's like a really small PR, send those right away). Or else you risk your PR not being merged, and I don't really want you to waste your time.

## Support development / say thanks

> [!TIP]
> If you found this plugin useful and wanted to say thanks with a coin, you can do so [here](https://sinja.io/support).
