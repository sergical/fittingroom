/**
 * Build-time stand-in for the full `shiki` bundle (see vite.config.ts).
 * The full bundle emits every grammar as its own chunk — hundreds of
 * files the fittingroom package would have to ship for a surface that
 * only highlights CSS patches. The web bundle carries the web grammars
 * (CSS included) but not the engine factories @pierre/diffs also pulls
 * from `shiki`, so those come from their own entry points here.
 */
export * from "shiki/bundle/web";
export { createJavaScriptRegexEngine } from "shiki/engine/javascript";
export { createOnigurumaEngine } from "shiki/engine/oniguruma";
