---
"fittingroom": minor
---

Add the font editor with Google Fonts audition: font tokens get a picker over a curated Google Fonts list, and the Preview loads the candidate stylesheet inside the iframe so the font auditions in place. Commit writes only the variable's value — fittingroom never guesses how the app loads fonts — and hands over the required `@import` snippet with a copy action. Hand-typed families still work through the text input, and an app with no font tokens shows no font section.
