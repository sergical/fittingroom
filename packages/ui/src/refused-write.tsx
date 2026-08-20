import { useEffect, useState, type ComponentType } from "react";

/**
 * The refused-write surface: the reason, the change the write declined
 * to make rendered as a diff, and a copy action so applying the patch
 * by hand takes seconds. The diff renderer loads on demand the first
 * time a refusal carries a diff, keeping it out of the initial UI
 * bundle; until it arrives — or if loading fails — the raw patch text
 * stands in.
 */
export default function RefusedWrite({
  reason,
  diff,
}: {
  reason: string;
  diff: string;
}) {
  const [DiffRenderer, setDiffRenderer] = useState<ComponentType<{
    patch: string;
  }> | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const hasDiff = diff !== "";

  // navigator.clipboard is undefined on non-secure origins, and
  // writeText rejects when the user denies permission; both surface as
  // a visible failure instead of a silent no-op.
  const copyPatch = async () => {
    try {
      await navigator.clipboard.writeText(diff);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };

  useEffect(() => {
    if (!hasDiff) return;
    let cancelled = false;
    import("./refusal-diff.js").then(
      (module) => {
        if (!cancelled) setDiffRenderer(() => module.default);
      },
      () => {
        // A failed chunk load leaves the raw patch text showing.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasDiff]);

  return (
    <section className="lab-refusal" aria-label="Refused write">
      <p>Write refused: {reason}</p>
      {hasDiff && (
        <>
          {DiffRenderer ? <DiffRenderer patch={diff} /> : <pre>{diff}</pre>}
          <button type="button" className="lab-copy" onClick={copyPatch}>
            Copy patch
          </button>
          {copyFailed && (
            <p role="alert">
              Copying failed — select the patch text above and copy it
              manually.
            </p>
          )}
        </>
      )}
    </section>
  );
}
