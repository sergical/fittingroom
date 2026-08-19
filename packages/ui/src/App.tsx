import { useEffect, useRef, useState } from "react";
import type { Edits, Token, TokenDocument } from "@fittingroom/core";
import { sendProtocolRequest } from "./protocol-client.js";
import {
  baseValue,
  isSpacingToken,
  scaleLength,
  spacingEdits,
  type SpacingEdit,
} from "./spacing.js";

/** Unsaved edits live in localStorage so a reload of the lab UI keeps them. */
const DRAFT_STORAGE_KEY = "fittingroom:draft-edits";
/** The spacing controls (density, per-token bases) persist the same way. */
const SPACING_STORAGE_KEY = "fittingroom:spacing-draft";

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

/**
 * The spacing editor's state: the headline density multiplier over all
 * spacing tokens, plus per-token base overrides that compose with it
 * (effective value = base × density).
 */
interface SpacingState {
  density: number;
  bases: Record<string, string>;
}

const NO_SPACING: SpacingState = { density: 1, bases: {} };

function loadDrafts(): Drafts {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? "{}") as Drafts;
  } catch {
    return {};
  }
}

function loadSpacing(): SpacingState {
  try {
    const stored = JSON.parse(
      localStorage.getItem(SPACING_STORAGE_KEY) ?? "null",
    ) as SpacingState | null;
    if (
      stored &&
      typeof stored.density === "number" &&
      Number.isFinite(stored.density) &&
      stored.density > 0 &&
      stored.bases
    ) {
      return stored;
    }
  } catch {
    // fall through to the default
  }
  return NO_SPACING;
}

export default function App() {
  const [tokenDocument, setTokenDocument] = useState<TokenDocument | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>(loadDrafts);
  const [spacing, setSpacing] = useState<SpacingState>(loadSpacing);
  const [refusal, setRefusal] = useState<{ reason: string; diff: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const spacingRef = useRef(spacing);
  spacingRef.current = spacing;
  const documentRef = useRef(tokenDocument);
  documentRef.current = tokenDocument;

  const tokenByName = (name: string): Token | undefined =>
    documentRef.current?.tokens.find((token) => token.name === name);

  /**
   * A draft edits the light half of a token, so a paired emdash token
   * must preview as `light-dark(draft, dark)` — a bare value would also
   * override the dark half, showing a state a commit never produces.
   */
  const previewValue = (token: Token | undefined, draft: SpacingEdit): string => {
    const light = typeof draft === "string" ? draft : draft.light;
    if (
      documentRef.current?.dialect === "emdash" &&
      token?.value.raw === undefined &&
      token?.value.dark !== undefined
    ) {
      const dark = typeof draft === "string" ? token.value.dark : draft.dark;
      return `light-dark(${light}, ${dark})`;
    }
    return light;
  };

  /** Drafts plus the spacing editor's computed values, as one edit set. */
  const mergedDrafts = (): Record<string, SpacingEdit> => ({
    ...spacingEdits(
      documentRef.current?.tokens ?? [],
      spacingRef.current.density,
      spacingRef.current.bases,
    ),
    ...draftsRef.current,
  });

  const pushPreview = () => {
    const edits = Object.fromEntries(
      Object.entries(mergedDrafts()).map(([name, draft]) => [
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
    localStorage.setItem(SPACING_STORAGE_KEY, JSON.stringify(spacing));
    pushPreview();
  }, [drafts, spacing, tokenDocument]);

  const setDraft = (token: Token, value: string) => {
    setDrafts((previous) => {
      if (value === baseValue(token)) {
        const { [token.name]: _dropped, ...rest } = previous;
        return rest;
      }
      return { ...previous, [token.name]: value };
    });
  };

  const setSpacingBase = (token: Token, value: string) => {
    setSpacing((previous) => {
      if (value === baseValue(token)) {
        const { [token.name]: _dropped, ...bases } = previous.bases;
        return { ...previous, bases };
      }
      return { ...previous, bases: { ...previous.bases, [token.name]: value } };
    });
  };

  /**
   * A draft is a light-half edit, so a paired token gets an object edit
   * — a bare string would tell the emdash writer to replace the whole
   * `light-dark()` value and silently drop the dark half.
   */
  const toEdits = (drafts: Record<string, SpacingEdit>): Edits =>
    Object.fromEntries(
      Object.entries(drafts).map(([name, draft]) => {
        if (typeof draft !== "string") return [name, draft];
        return [
          name,
          tokenByName(name)?.value.raw === undefined ? { light: draft } : draft,
        ];
      }),
    );

  const commit = async () => {
    const committed = mergedDrafts();
    const submittedSpacing = spacingRef.current;
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
      // The computed spacing values are in the file now, so they are the
      // new originals: the multiplier returns to ×1 over them. Spacing
      // work done while the request was in flight is rebased onto the
      // new originals so its effective values (base × density) carry
      // over instead of vanishing.
      setSpacing((current) => {
        if (current === submittedSpacing) return NO_SPACING;
        return {
          density: current.density / submittedSpacing.density,
          bases: Object.fromEntries(
            Object.entries(current.bases).map(([name, base]) => [
              name,
              scaleLength(base, submittedSpacing.density),
            ]),
          ),
        };
      });
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
  const spacingTokens = tokenDocument?.tokens.filter(isSpacingToken) ?? [];
  const derivedSpacing = spacingEdits(
    tokenDocument?.tokens ?? [],
    spacing.density,
    spacing.bases,
  );
  const draftCount = Object.keys({ ...derivedSpacing, ...drafts }).length;

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
          {loaded && tokenDocument && colorTokens.length === 0 && spacingTokens.length === 0 && (
            <p className="lab-empty">
              {tokenDocument.tokens.length} token
              {tokenDocument.tokens.length === 1 ? "" : "s"} detected, but none
              hold a color or spacing value the editor can edit.
            </p>
          )}
          {colorTokens.length > 0 && spacingTokens.length > 0 && (
            <h2 className="lab-section-title">Colors</h2>
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
          {spacingTokens.length > 0 && (
            <>
              <h2 className="lab-section-title">Spacing</h2>
              <div className="lab-density">
                <span className="lab-token-name">density</span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.05"
                  aria-label="Density multiplier"
                  value={spacing.density}
                  onChange={(event) =>
                    setSpacing((previous) => ({
                      ...previous,
                      density: Number(event.target.value),
                    }))
                  }
                />
                <input
                  type="number"
                  min="0.5"
                  max="2"
                  step="0.05"
                  aria-label="Density multiplier value"
                  value={spacing.density}
                  onChange={(event) => {
                    const typed = Number(event.target.value);
                    if (!Number.isFinite(typed)) return;
                    // Hold the typed value to the slider's 0.5–2 range so
                    // an out-of-range entry cannot emit invalid CSS.
                    const density = Math.min(2, Math.max(0.5, typed));
                    setSpacing((previous) => ({ ...previous, density }));
                  }}
                />
                <button
                  type="button"
                  className="lab-reset"
                  aria-label="Reset spacing"
                  disabled={
                    spacing.density === 1 && Object.keys(spacing.bases).length === 0
                  }
                  onClick={() => setSpacing(NO_SPACING)}
                >
                  Reset
                </button>
              </div>
              {spacingTokens.map((token) => {
                const base = spacing.bases[token.name] ?? baseValue(token);
                const computed = scaleLength(base, spacing.density);
                return (
                  <div className="lab-token" key={token.name}>
                    <span className="lab-token-name">{token.name}</span>
                    {computed !== base && (
                      <span className="lab-token-computed">= {computed}</span>
                    )}
                    <input
                      type="text"
                      aria-label={`${token.name} value`}
                      value={base}
                      onChange={(event) => setSpacingBase(token, event.target.value)}
                    />
                  </div>
                );
              })}
            </>
          )}
        </section>

        <section className="lab-preview" aria-label="Preview">
          <iframe ref={iframeRef} title="Preview" src="/" onLoad={pushPreview} />
        </section>
      </div>
    </div>
  );
}
