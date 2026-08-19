---
"fittingroom": minor
---

Add the shadow editor: a presets tab for picking a look fast and a decomposed-sliders tab (offset-x, offset-y, blur, spread, color) for tuning precisely. Whatever tab an edit comes from, the stored token value is always the one composed box-shadow string, previewed live and committed through the ordinary edit path. A value the sliders cannot decompose (multi-layer, var()) still takes presets and hand edits, and an app with no shadow tokens shows no shadow section.
