---
"fittingroom": minor
---

Give candidate looks an identity: the lab UI now saves the current edit set as a named Fit, lists saved Fits, applies one back onto the Preview, and deletes one — all through the Protocol's existing Fit messages. Fits are stored as pretty-printed JSON under `.fittingroom/` in the host repo, human-readable and git-diff-friendly, so looks travel with the branch. Applying a Fit replaces the draft set — the Preview updates instantly — and committing an applied Fit goes through the ordinary write path, round-trip refusal included.
