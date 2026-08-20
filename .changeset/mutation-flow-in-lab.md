---
"fittingroom": minor
---

The dev server detects AI Mutation Providers at boot and serves them over
the Protocol. In the lab, a prompt produces a Mutation that arrives as an
unsaved Fit applied to the Preview; committing it uses the ordinary write
path and its refusal gate, and a follow-up prompt refines the active
Mutation. With several Providers the lab shows a picker, CLI-first; with
none, the mutation UI is absent.
