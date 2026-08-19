---
"@fittingroom/core": minor
---

Fold the parsers and serializer behind one deep TokenSource module: `createTokenSource(filePath)` with `read()` → TokenDocument and `write(edits)` → applied | refused(diff, reason). Dialect detection (shadcn, emdash) is content-based and internal; writes enforce the round-trip refusal invariant. The standalone `parseShadcn`, `parseEmdash`, and `applyEdits` exports are removed, and `TokenSet` is renamed to `TokenDocument`.
