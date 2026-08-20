import { installPreviewClient } from "./preview-client.js";
import { demoDocument, sampleCss } from "./sample.js";

// The sample page's token CSS is generated from the same document the
// demo adapter serves, so the editors, the Preview, and the simulated
// commit diff can never drift apart.
const style = document.createElement("style");
style.textContent = sampleCss(demoDocument);
document.head.prepend(style);

installPreviewClient();
