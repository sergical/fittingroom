---
"@fittingroom/core": minor
"fittingroom": minor
---

Surface refused writes as an actionable diff. A TokenSource refusal now carries a best-effort unified diff of the change it declined to make — computed textually, so it exists even for a file the dialect cannot parse — instead of the internal round-trip discrepancy. In the lab UI a refused commit renders that diff (via @pierre/diffs, lazy-loaded so the renderer stays out of the initial bundle) with the refusal reason and a "Copy patch" action, so applying the change by hand takes seconds. No file is ever mutated by a refused commit.
