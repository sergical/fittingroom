---
"@fittingroom/core": minor
---

Add the Protocol connecting clients to the TokenSource: a typed message set (`read`, `preview`, `commit`, and Fit `save`/`list`/`apply`/`delete`) behind one `ProtocolAdapter` interface, with two adapters. `createTokenSourceAdapter({ source, fitsDir })` is the real one — commits inherit round-trip refusal and Fits persist as JSON files in the fits directory. `createFakeAdapter()` holds a sample TokenDocument in memory and simulates writes (with an optional configured refusal), needing no filesystem or server. Refused writes travel through the Protocol with their diff and reason intact.
