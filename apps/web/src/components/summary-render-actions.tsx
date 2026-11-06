"use client";
import { useState } from "react";
import { showToast } from "../lib/toast";
import { Toaster } from "./shell/toaster";
import { Button } from "./ui/button";

type Labels = {
  copy: string;
  save: string;
  copied: string;
  copyFailed: string;
  unavailable: string;
  failed: string;
};
export function SummaryRenderActions({
  source,
  labels,
}: {
  source:
    | { summaryId: string; shareToken?: never }
    | { shareToken: string; summaryId?: never };
  labels: Labels;
}) {
  const [busy, setBusy] = useState(false);
  async function render(format: "txt" | "png") {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        source.shareToken
          ? "/api/shared-summary"
          : `/api/summaries/${source.summaryId}/render?format=${format}`,
        {
          method: source.shareToken ? "POST" : "GET",
          credentials: "same-origin",
          cache: "no-store",
          ...(source.shareToken
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: source.shareToken, format }),
              }
            : {}),
        },
      );
      if (!response.ok) {
        showToast(response.status === 404 ? labels.unavailable : labels.failed);
        return;
      }
      if (format === "txt") {
        const text = await response.text();
        try {
          await navigator.clipboard.writeText(text);
          showToast(labels.copied);
        } catch {
          showToast(labels.copyFailed);
        }
      } else {
        if (!response.headers.get("content-type")?.startsWith("image/png"))
          throw new Error("Invalid image response");
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `taff-summary-${source.summaryId ?? "shared"}.png`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch {
      showToast(labels.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        data-testid="summary-copy-text"
        disabled={busy}
        onClick={() => void render("txt")}
      >
        {labels.copy}
      </Button>
      <Button
        data-testid="summary-save-image"
        disabled={busy}
        onClick={() => void render("png")}
      >
        {labels.save}
      </Button>
      {source.shareToken && <Toaster />}
    </>
  );
}
