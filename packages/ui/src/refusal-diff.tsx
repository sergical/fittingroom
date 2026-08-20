import { PatchDiff } from "@pierre/diffs/react";

/**
 * The rendered half of the refused-write surface. This module pulls in
 * @pierre/diffs and its Shiki highlighter, so it must only ever be
 * reached through the dynamic import in refused-write.tsx — a static
 * import anywhere would drag the renderer into the initial UI bundle.
 */
export default function RefusalDiff({ patch }: { patch: string }) {
  return (
    <div className="lab-refusal-rendered">
      <PatchDiff patch={patch} disableWorkerPool />
    </div>
  );
}
