---
"fittingroom": minor
---

Add the spacing editor: a headline density multiplier that live-previews across all spacing tokens at once, with per-token detail underneath for fine-tuning. Per-token base overrides compose with the multiplier (effective value = base × density), commit writes the computed values back through the ordinary edit path, and reset restores the original values. Spacing controls survive a reload of the lab UI, like other unsaved edits.
