/**
 * The browser-safe surface of the core: the model, the Protocol, and the
 * in-memory fake adapter.
 *
 * TokenSource, the filesystem TokenSource adapter, and Provider detection
 * are deliberately absent — each imports `node:` modules, and bundling
 * them for a browser yields stubs that throw on evaluation rather than a
 * build error. Node consumers import the `.` entry, which has everything.
 */
export * from "./model/types.js";
export * from "./protocol/fake-adapter.js";
export * from "./protocol/protocol.js";
export * from "./provider/provider.js";
