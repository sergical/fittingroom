import { useEffect, useRef, useState } from "react";
import type {
  Edit,
  Edits,
  Fit,
  ProtocolAdapter,
  Token,
  TokenDocument,
} from "@fittingroom/core";
import { httpAdapter } from "./protocol-client.js";
import RefusedWrite from "./refused-write.js";
import {
  draftedValue,
  previewBuckets,
  schemeValue,
  withDraft,
  type Scheme,
} from "./scheme.js";
import {
  baseValue,
  isSpacingToken,
  scaleLength,
  spacingEdits,
} from "./spacing.js";
import {
  composeShadowLayers,
  isShadowToken,
  parseShadowLayers,
  SHADOW_PRESETS,
  type DecomposedShadow,
  type ShadowLength,
} from "./shadow.js";
import {
  fontImportSnippet,
  GOOGLE_FONTS,
  googleFontByFamily,
  googleFontsUrl,
  isFontToken,
  primaryFamily,
  withFamily,
} from "./font.js";

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

type Drafts = Record<string, Edit>;

/**
 * The spacing editor's state: the headline density multiplier over all
 * spacing tokens, plus per-token base overrides that compose with it
 * (effective value = base × density). Base overrides are Edit values —
 * a paired token's override targets the previewed scheme's half, and a
 * persisted bare string is a legacy light-half override.
 */
interface SpacingState {
  density: number;
  bases: Record<string, Edit>;
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

/**
 * The lab UI is a Protocol client and nothing more: it takes whatever
 * adapter it is handed — the shipped UI gets the HTTP adapter, tests
 * and the hosted demo the in-memory fake.
 */
export default function App({
  adapter = httpAdapter,
}: {
  adapter?: ProtocolAdapter;
}) {
  const [tokenDocument, setTokenDocument] = useState<TokenDocument | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>(loadDrafts);
  const [scheme, setScheme] = useState<Scheme>("light");
  const [spacing, setSpacing] = useState<SpacingState>(loadSpacing);
  const [shadowTab, setShadowTab] = useState<"presets" | "sliders">("presets");
  const [fits, setFits] = useState<Fit[]>([]);
  const [fitName, setFitName] = useState("");
  const [importSnippet, setImportSnippet] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ reason: string; diff: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;
  const spacingRef = useRef(spacing);
  spacingRef.current = spacing;
  const documentRef = useRef(tokenDocument);
  documentRef.current = tokenDocument;

  const tokenByName = (name: string): Token | undefined =>
    documentRef.current?.tokens.find((token) => token.name === name);

  /** The value an editor row shows: the previewed scheme's half. */
  const shownValue = (token: Token): string =>
    draftedValue(drafts[token.name], token, scheme) ?? schemeValue(token, scheme);

  /** Drafts plus the spacing editor's computed values, as one edit set. */
  const mergedDrafts = (): Record<string, Edit> => ({
    ...spacingEdits(
      documentRef.current?.tokens ?? [],
      spacingRef.current.density,
      spacingRef.current.bases,
    ),
    ...draftsRef.current,
  });

  /**
   * The Google families an edit set auditions: the primary family of
   * every font-token edit half that names a font from the curated list.
   * Both halves load, so toggling the previewed scheme auditions
   * instantly. Hand-typed families stay out — there is nothing to load
   * for them.
   */
  const googleFamilies = (edits: Record<string, Edit>): string[] => {
    const families = Object.entries(edits)
      .filter(([name]) => {
        const token = tokenByName(name);
        return token !== undefined && isFontToken(token);
      })
      .flatMap(([, draft]) =>
        typeof draft === "string" ? [draft] : [draft.light, draft.dark],
      )
      .filter((value): value is string => value !== undefined)
      .map(primaryFamily)
      .filter((family) => googleFontByFamily(family) !== undefined);
    return [...new Set(families)];
  };

  const pushPreview = () => {
    const merged = mergedDrafts();
    const buckets = previewBuckets(documentRef.current, merged);
    // The candidate font must render in place, so the preview client
    // loads its stylesheet inside the iframe alongside the overrides.
    const families = googleFamilies(merged);
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "fittingroom:preview",
        edits: buckets.light,
        darkEdits: buckets.dark,
        scheme: schemeRef.current,
        fonts: families.length > 0 ? [googleFontsUrl(families)] : [],
      },
      window.location.origin,
    );
  };

  useEffect(() => {
    void adapter.handle({ type: "read" }).then((response) => {
      if (response.type === "document") setTokenDocument(response.document);
      if (response.type === "error") setError(response.message);
      setLoaded(true);
    });
    // Fits saved in earlier sessions (or by teammates, via git) list
    // alongside the tokens from the start.
    void adapter.handle({ type: "list-fits" }).then((response) => {
      if (response.type === "fits") setFits(response.fits);
    });
  }, [adapter]);

  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    localStorage.setItem(SPACING_STORAGE_KEY, JSON.stringify(spacing));
    pushPreview();
  }, [drafts, spacing, scheme, tokenDocument]);

  /** Edit what you see: a change targets the previewed scheme's half. */
  const setDraft = (token: Token, value: string) => {
    setDrafts((previous) => withDraft(previous, token, schemeRef.current, value));
  };

  /** Edit what you see: a base override targets the previewed scheme's half. */
  const setSpacingBase = (token: Token, value: string) => {
    setSpacing((previous) => ({
      ...previous,
      bases: withDraft(previous.bases, token, schemeRef.current, value),
    }));
  };

  /**
   * A bare-string draft on a non-raw token is a light-half edit, so it
   * commits as an object edit — a bare string would tell the emdash
   * writer to replace the whole `light-dark()` value and silently drop
   * the dark half.
   */
  const toEdits = (drafts: Record<string, Edit>): Edits =>
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
    const response = await adapter.handle({
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
        const rebase = (base: Edit): Edit =>
          typeof base === "string"
            ? scaleLength(base, submittedSpacing.density)
            : {
                ...(base.light !== undefined && {
                  light: scaleLength(base.light, submittedSpacing.density),
                }),
                ...(base.dark !== undefined && {
                  dark: scaleLength(base.dark, submittedSpacing.density),
                }),
              };
        return {
          density: current.density / submittedSpacing.density,
          bases: Object.fromEntries(
            Object.entries(current.bases).map(([name, base]) => [name, rebase(base)]),
          ),
        };
      });
      // The commit wrote only the variable value; loading the font is
      // the developer's move, so hand over the import they need.
      const committedFamilies = googleFamilies(committed);
      setImportSnippet(
        committedFamilies.length > 0 ? fontImportSnippet(committedFamilies) : null,
      );
      setRefusal(null);
      setError(null);
      const read = await adapter.handle({ type: "read" });
      if (read.type === "document") setTokenDocument(read.document);
    } else if (response.type === "refused") {
      setRefusal({ reason: response.reason, diff: response.diff });
    } else if (response.type === "error") {
      setError(response.message);
    }
  };

  /** Names the current edit set: it becomes a Fit the adapter stores. */
  const saveFit = async () => {
    const response = await adapter.handle({
      type: "save-fit",
      name: fitName.trim(),
      edits: toEdits(mergedDrafts()),
    });
    if (response.type === "fit-saved") {
      setFits((previous) =>
        [
          ...previous.filter((fit) => fit.name !== response.fit.name),
          response.fit,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setFitName("");
      setError(null);
    } else if (response.type === "error") {
      setError(response.message);
    }
  };

  /**
   * A Fit's edits become the draft set, replacing whatever was drafted:
   * the preview effect pushes them, and committing them goes through
   * the ordinary write path. Spacing state resets because the Fit's
   * stored edits already carry any computed spacing values.
   */
  const applyFit = async (name: string) => {
    const response = await adapter.handle({ type: "apply-fit", name });
    if (response.type === "fit-applied") {
      setDrafts(response.fit.edits);
      setSpacing(NO_SPACING);
      setError(null);
    } else if (response.type === "error") {
      setError(response.message);
    }
  };

  const deleteFit = async (name: string) => {
    const response = await adapter.handle({ type: "delete-fit", name });
    if (response.type === "fit-deleted") {
      setFits((previous) => previous.filter((fit) => fit.name !== response.name));
      setError(null);
    } else if (response.type === "error") {
      setError(response.message);
    }
  };

  const colorTokens =
    tokenDocument?.tokens.filter((token) => isColorValue(baseValue(token))) ?? [];
  const fontTokens = tokenDocument?.tokens.filter(isFontToken) ?? [];
  const spacingTokens = tokenDocument?.tokens.filter(isSpacingToken) ?? [];
  const shadowTokens = tokenDocument?.tokens.filter(isShadowToken) ?? [];
  const sectionCount = [colorTokens, fontTokens, spacingTokens, shadowTokens].filter(
    (tokens) => tokens.length > 0,
  ).length;
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
      {refusal && <RefusedWrite reason={refusal.reason} diff={refusal.diff} />}
      {importSnippet && (
        <section className="lab-import" aria-label="Font import">
          <p>
            Committed. Add this import where your app's CSS begins so it loads
            the font:
          </p>
          <pre>{importSnippet}</pre>
          <button
            type="button"
            className="lab-copy"
            onClick={() => void navigator.clipboard.writeText(importSnippet)}
          >
            Copy
          </button>
        </section>
      )}

      <div className="lab-panes">
        <section className="lab-token-list" aria-label="Tokens">
          {loaded && !tokenDocument && (
            <p className="lab-empty">
              No tokens detected. Supported dialects: shadcn, emdash.
            </p>
          )}
          {loaded && tokenDocument && sectionCount === 0 && (
            <p className="lab-empty">
              {tokenDocument.tokens.length} token
              {tokenDocument.tokens.length === 1 ? "" : "s"} detected, but none
              hold a color, font, spacing, or shadow value the editor can edit.
            </p>
          )}
          {colorTokens.length > 0 && sectionCount > 1 && (
            <h2 className="lab-section-title">Colors</h2>
          )}
          {colorTokens.map((token) => {
            const current = shownValue(token);
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
          {fontTokens.length > 0 && (
            <>
              <h2 className="lab-section-title">Fonts</h2>
              {fontTokens.map((token) => {
                const current = shownValue(token);
                const picked = googleFontByFamily(primaryFamily(current));
                return (
                  <div className="lab-token" key={token.name}>
                    <span className="lab-token-name">{token.name}</span>
                    <select
                      aria-label={`${token.name} font`}
                      value={picked?.family ?? ""}
                      onChange={(event) => {
                        const font = googleFontByFamily(event.target.value);
                        if (font) setDraft(token, withFamily(current, font));
                      }}
                    >
                      {/* The current stack when no Google font is picked;
                          selecting it again is a no-op, not an edit. */}
                      {!picked && <option value="">{primaryFamily(current)}</option>}
                      {GOOGLE_FONTS.map((font) => (
                        <option key={font.family} value={font.family}>
                          {font.family}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      aria-label={`${token.name} value`}
                      value={current}
                      onChange={(event) => setDraft(token, event.target.value)}
                    />
                  </div>
                );
              })}
            </>
          )}
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
                const base =
                  draftedValue(spacing.bases[token.name], token, scheme) ??
                  schemeValue(token, scheme);
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
          {shadowTokens.length > 0 && (
            <>
              <h2 className="lab-section-title">Shadows</h2>
              <div className="lab-tabs" role="tablist" aria-label="Shadow editor">
                {(["presets", "sliders"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={shadowTab === tab}
                    className={`lab-tab${shadowTab === tab ? " lab-tab-active" : ""}`}
                    onClick={() => setShadowTab(tab)}
                  >
                    {tab === "presets" ? "Presets" : "Sliders"}
                  </button>
                ))}
              </div>
              {shadowTokens.map((token) => {
                const current = shownValue(token);
                return (
                  <div className="lab-shadow" key={token.name}>
                    <div className="lab-token">
                      <span className="lab-token-name">{token.name}</span>
                      <button
                        type="button"
                        className="lab-reset"
                        aria-label={`Reset ${token.name}`}
                        disabled={
                          draftedValue(drafts[token.name], token, scheme) ===
                          undefined
                        }
                        onClick={() => setDraft(token, schemeValue(token, scheme))}
                      >
                        Reset
                      </button>
                    </div>
                    {shadowTab === "presets" ? (
                      <div className="lab-preset-row" role="group" aria-label={`${token.name} presets`}>
                        {SHADOW_PRESETS.map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            className="lab-preset"
                            aria-pressed={current === preset.value}
                            onClick={() => setDraft(token, preset.value)}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <ShadowSliders
                        token={token}
                        value={current}
                        onChange={(value) => setDraft(token, value)}
                      />
                    )}
                  </div>
                );
              })}
            </>
          )}
          {tokenDocument && (
            <section className="lab-fits" aria-label="Fits">
              <h2 className="lab-section-title">Fits</h2>
              <div className="lab-fit-save">
                <input
                  type="text"
                  aria-label="Fit name"
                  placeholder="Name this look"
                  value={fitName}
                  onChange={(event) => setFitName(event.target.value)}
                />
                <button
                  type="button"
                  className="lab-save-fit"
                  disabled={draftCount === 0 || fitName.trim() === ""}
                  onClick={() => void saveFit()}
                >
                  Save Fit
                </button>
              </div>
              {fits.length === 0 ? (
                <p className="lab-empty">No saved Fits yet.</p>
              ) : (
                <ul className="lab-fit-list">
                  {fits.map((fit) => (
                    <li className="lab-fit" key={fit.name}>
                      <span className="lab-token-name">{fit.name}</span>
                      <button
                        type="button"
                        aria-label={`Apply ${fit.name}`}
                        onClick={() => void applyFit(fit.name)}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="lab-reset"
                        aria-label={`Delete ${fit.name}`}
                        onClick={() => void deleteFit(fit.name)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </section>

        <section className="lab-preview" aria-label="Preview">
          <div className="lab-preview-bar">
            {/* Edit what you see: the toggle decides which half of a
                light/dark pair the editors show and an edit targets. */}
            <button
              type="button"
              className="lab-scheme-toggle"
              aria-label="Preview color scheme"
              aria-pressed={scheme === "dark"}
              onClick={() =>
                setScheme((previous) => (previous === "light" ? "dark" : "light"))
              }
            >
              {scheme === "dark" ? "Dark" : "Light"}
            </button>
          </div>
          <iframe ref={iframeRef} title="Preview" src="/" onLoad={pushPreview} />
        </section>
      </div>
    </div>
  );
}

const SHADOW_SLIDERS: ReadonlyArray<{
  part: "offsetX" | "offsetY" | "blur" | "spread";
  label: string;
  min: number;
  max: number;
}> = [
  { part: "offsetX", label: "offset-x", min: -40, max: 40 },
  { part: "offsetY", label: "offset-y", min: -40, max: 40 },
  { part: "blur", label: "blur", min: 0, max: 80 },
  { part: "spread", label: "spread", min: -40, max: 40 },
];

/**
 * Slider steps follow the unit — whole px, fine steps for rem/em — and
 * refine further when the current value itself is fractional, so a
 * parsed value like 2.5px is reachable without snapping away.
 */
const sliderStep = ({ value, unit }: ShadowLength) => {
  if (unit !== "" && unit !== "px") return 0.05;
  return Number.isInteger(value) ? 1 : 0.1;
};

/**
 * A shadow color is either empty, a var() reference, or something the
 * browser accepts as a color. Anything else must not reach a draft: the
 * preview would silently drop it, but Commit could still write the
 * invalid box-shadow to the token file.
 */
const isShadowColor = (value: string): boolean =>
  value === "" || /^var\(--[\w-]+\)$/.test(value) || isColorValue(value);

/**
 * The decomposed half of the shadow editor. Every slider move composes
 * the layers back into one string before it becomes a draft — the token
 * never stores anything but the composed value. A value the sliders
 * cannot decompose (calc() lengths, keywords) degrades to a text input.
 */
function ShadowSliders({
  token,
  value,
  onChange,
}: {
  token: Token;
  value: string;
  onChange: (value: string) => void;
}) {
  const layers = parseShadowLayers(value);
  if (!layers) {
    return (
      <div className="lab-token">
        <input
          type="text"
          aria-label={`${token.name} value`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }
  const setLayer = (index: number, part: Partial<DecomposedShadow>) =>
    onChange(
      composeShadowLayers(
        layers.map((layer, i) => (i === index ? { ...layer, ...part } : layer)),
      ),
    );
  return (
    <div className="lab-shadow-sliders">
      {layers.map((layer, index) => (
        <ShadowLayerControls
          key={index}
          label={layers.length > 1 ? `${token.name} layer ${index + 1}` : token.name}
          shadow={layer}
          onChange={(part) => setLayer(index, part)}
        />
      ))}
    </div>
  );
}

function ShadowLayerControls({
  label,
  shadow,
  onChange,
}: {
  label: string;
  shadow: DecomposedShadow;
  onChange: (part: Partial<DecomposedShadow>) => void;
}) {
  // Invalid color text stays local until it parses; only valid colors
  // compose into the draft, so Commit can never write it to the file.
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  return (
    <>
      {SHADOW_SLIDERS.map(({ part, label: partLabel, min, max }) => {
        const length: ShadowLength = shadow[part];
        return (
          <div className="lab-token" key={part}>
            <span className="lab-token-name">{partLabel}</span>
            <input
              type="range"
              // Widen the range around out-of-band parsed values so the
              // thumb starts on the real value instead of jumping on
              // the first drag.
              min={Math.min(min, Math.floor(length.value))}
              max={Math.max(max, Math.ceil(length.value))}
              step={sliderStep(length)}
              aria-label={`${label} ${partLabel}`}
              value={length.value}
              onChange={(event) =>
                onChange({
                  [part]: { value: Number(event.target.value), unit: length.unit },
                })
              }
            />
            <span className="lab-token-computed">
              {length.value}
              {length.unit || "px"}
            </span>
          </div>
        );
      })}
      <div className="lab-token">
        <span className="lab-token-name">color</span>
        <input
          type="text"
          aria-label={`${label} color`}
          value={colorDraft ?? shadow.color}
          onBlur={() => setColorDraft(null)}
          onChange={(event) => {
            const next = event.target.value;
            if (isShadowColor(next)) {
              setColorDraft(null);
              onChange({ color: next });
            } else {
              setColorDraft(next);
            }
          }}
        />
      </div>
    </>
  );
}
