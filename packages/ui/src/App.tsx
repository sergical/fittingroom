import { useEffect, useRef, useState } from "react";
import type { Token, TokenDocument } from "@fittingroom/core";
import { sendProtocolRequest } from "./protocol-client.js";

/** Unsaved edits live in localStorage so a reload of the lab UI keeps them. */
const DRAFT_STORAGE_KEY = "fittingroom:draft-edits";

const COLOR_VALUE =
  /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(.*\))$/i;
const HEX_VALUE = /^#[0-9a-f]{6}$/i;

type Drafts = Record<string, string>;

function loadDrafts(): Drafts {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? "{}") as Drafts;
  } catch {
    return {};
  }
}

/** The value an edit replaces: the raw value, or the light half of a pair. */
function baseValue(token: Token): string {
  return token.value.raw ?? token.value.light ?? "";
}

export default function App() {
  const [tokenDocument, setTokenDocument] = useState<TokenDocument | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>(loadDrafts);
  const [refusal, setRefusal] = useState<{ reason: string; diff: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const pushPreview = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "fittingroom:preview", edits: draftsRef.current },
      window.location.origin,
    );
  };

  useEffect(() => {
    void sendProtocolRequest({ type: "read" }).then((response) => {
      if (response.type === "document") setTokenDocument(response.document);
      if (response.type === "error") setError(response.message);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    pushPreview();
  }, [drafts]);

  const setDraft = (token: Token, value: string) => {
    setDrafts((previous) => {
      if (value === baseValue(token)) {
        const { [token.name]: _dropped, ...rest } = previous;
        return rest;
      }
      return { ...previous, [token.name]: value };
    });
  };

  const commit = async () => {
    const response = await sendProtocolRequest({ type: "commit", edits: drafts });
    if (response.type === "committed") {
      setDrafts({});
      setRefusal(null);
      setError(null);
      const read = await sendProtocolRequest({ type: "read" });
      if (read.type === "document") setTokenDocument(read.document);
    } else if (response.type === "refused") {
      setRefusal({ reason: response.reason, diff: response.diff });
    } else if (response.type === "error") {
      setError(response.message);
    }
  };

  const colorTokens =
    tokenDocument?.tokens.filter((token) => COLOR_VALUE.test(baseValue(token))) ?? [];
  const draftCount = Object.keys(drafts).length;

  return (
    <div className="lab-shell">
      <header className="lab-header">
        <div>
          <h1>fittingroom</h1>
          <p>design-token fitting room</p>
        </div>
        <button
          type="button"
          className="lab-commit"
          disabled={draftCount === 0}
          onClick={() => void commit()}
        >
          Commit{draftCount > 0 ? ` ${draftCount} edit${draftCount > 1 ? "s" : ""}` : ""}
        </button>
      </header>

      {error && <p className="lab-error">{error}</p>}
      {refusal && (
        <section className="lab-refusal" aria-label="Refused write">
          <p>Write refused: {refusal.reason}</p>
          {refusal.diff && <pre>{refusal.diff}</pre>}
        </section>
      )}

      <div className="lab-panes">
        <section className="lab-token-list" aria-label="Tokens">
          {loaded && !tokenDocument && (
            <p className="lab-empty">
              No tokens detected. Supported dialects: shadcn, emdash.
            </p>
          )}
          {colorTokens.map((token) => {
            const current = drafts[token.name] ?? baseValue(token);
            return (
              <div className="lab-token" key={token.name}>
                <span className="lab-token-name">{token.name}</span>
                <input
                  type="color"
                  aria-label={`${token.name} picker`}
                  value={HEX_VALUE.test(current) ? current : "#000000"}
                  onChange={(event) => setDraft(token, event.target.value)}
                />
                <input
                  type="text"
                  aria-label={`${token.name} value`}
                  value={current}
                  onChange={(event) => setDraft(token, event.target.value)}
                />
              </div>
            );
          })}
        </section>

        <section className="lab-preview" aria-label="Preview">
          <iframe ref={iframeRef} title="Preview" src="/" onLoad={pushPreview} />
        </section>
      </div>
    </div>
  );
}
