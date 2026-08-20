import "./theme.css";
import "./styles.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="hero">
    <h1>fittingroom emdash example app</h1>
    <p>
      This page is styled with emdash-dialect tokens — <code>light-dark()</code>
      pairs, no dark class. Open
      <a href="/__fittingroom/">/__fittingroom/</a> to edit them live.
    </p>
    <button type="button">Primary action</button>
    <div class="card">A surface card, for judging both halves of a pair.</div>
  </main>
`;
