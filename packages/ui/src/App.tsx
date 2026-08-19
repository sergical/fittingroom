import { useEffect, useRef, useState } from "react";
import type { Edits, Token, TokenDocument } from "@fittingroom/core";
import { sendProtocolRequest } from "./protocol-client.js";

/** Unsaved edits live in localStorage so a reload of the lab UI keeps them. */
const DRAFT_STORAGE_KEY = "fittingroom:draft-edits";

const COLOR_VALUE =
  /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(.*\))$/i;
const HEX_VALUE = /^#[0-9a-f]{6}$/i;

/**
 * The browser is the authority on what parses as a color ('red',
 * 'transparent', ...); the regex covers test environments without
 * CSS.supports. `var()` references pass CSS.supports for any property,
 * so they are excluded explicitly.
 */
function isColorValue(value: string): boolean {
  if (COLOR_VALUE.test(value)) return true;
  return (
    typeof CSS !== "undefined" &&
    value !== "" &&
    !value.includes("var(") &&
    CSS.supports("color", value)
  );
}

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
  const documentRef = useRef(tokenDocument);
  documentRef.current = tokenDocument;

  const tokenByName = (name: string): Token | undefined =>
    documentRef.current?.tokens.find((token) => token.name === name);

  /**
   * A draft edits the light half of a token, so a paired emdash token
   * must preview as `light-dark(draft, dark)` — a bare value would also
   * override the dark half, showing a state a commit never produces.
   */
  const previewValue = (token: Token | undefined, draft: string): string => {
    if (
      documentRef.current?.dialect === "emdash" &&
      token?.value.raw === undefined &&
      token?.value.dark !== undefined
    ) {
      return `light-dark(${draft}, ${token.value.dark})`;
    }
    return draft;
  };

  const pushPreview = () => {
    const edits = Object.fromEntries(
      Object.entries(draftsRef.current).map(([name, draft]) => [
        name,
        previewValue(tokenByName(name), draft),
      ]),
    );
    iframeRef.current?.contentWindow?.postMessage(
      { type: "fittingroom:preview", edits },
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
  }, [drafts, tokenDocument]);

  const setDraft = (token: Token, value: string) => {
    setDrafts((previous) => {
      if (value === baseValue(token)) {
        const { [token.name]: _dropped, ...rest } = previous;
        return rest;
      }
      return { ...previous, [token.name]: value };
    });
  };

  /**
   * A draft is a light-half edit, so a paired token gets an object edit
   * — a bare string would tell the emdash writer to replace the whole
   * `light-dark()` value and silently drop the dark half.
   */
  const toEdits = (drafts: Drafts): Edits =>
    Object.fromEntries(
      Object.entries(drafts).map(([name, draft]) => [
        name,
        tokenByName(name)?.value.raw === undefined ? { light: draft } : draft,
      ]),
    );

  const commit = async () => {
    const committed = draftsRef.current;
    const response = await sendProtocolRequest({
      type: "commit",
      edits: toEdits(committed),
    });
    if (response.type === "committed") {
      // Drop only the drafts this commit wrote; an edit typed while the
      // request was in flight stays a draft instead of vanishing.
      setDrafts((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([name, draft]) => committed[name] !== draft),
        ),
      );
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
    tokenDocument?.tokens.filter((token) => isColorValue(baseValue(token))) ?? [];
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
          {loaded && tokenDocument && colorTokens.length === 0 && (
            <p className="lab-empty">
              {tokenDocument.tokens.length} token
              {tokenDocument.tokens.length === 1 ? "" : "s"} detected, but none
              hold a color value the editor can edit.
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
