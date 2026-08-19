import "./styles.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="hero">
    <h1>fittingroom example app</h1>
    <p>
      This page is styled with design tokens. Open
      <a href="/__fittingroom/">/__fittingroom/</a> to edit them live.
    </p>
    <button type="button">Primary action</button>
    <div class="card">A muted card, for judging surface colors.</div>
  </main>
`;
