---
"@fittingroom/core": minor
---

Add a browser-safe entry point at `@fittingroom/core/browser`, exporting the model, the Protocol, and the in-memory fake adapter. The main entry re-exports TokenSource, the filesystem adapter, and Provider detection, all of which import `node:` modules; a bundler asked to put them in a browser build emits stubs that throw while the module evaluates, with no build error to show for it. That is what left the hosted demo rendering a blank page. Browser clients now import the subpath instead, and a test walks the subpath's import graph to keep `node:` out of it.
