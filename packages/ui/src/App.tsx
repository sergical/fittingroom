/** Placeholder shell for the laboratory UI. Real token editing lands later. */
export default function App() {
  return (
    <div className="lab-shell">
      <header className="lab-header">
        <h1>TokenLab</h1>
        <p>design-token laboratory</p>
      </header>
      <section className="lab-token-list" aria-label="Tokens">
        {/* TODO: render tokens fetched from the plugin's extraction endpoint. */}
      </section>
    </div>
  );
}
