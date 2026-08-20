import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App.js";
import "../src/styles.css";
import { createDemoAdapter } from "./adapter.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App adapter={createDemoAdapter()} previewSrc="./preview.html" />
  </StrictMode>,
);
