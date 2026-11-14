"use client";
// Exported view images (ADR 0031, spec view-export VE-3): one button opens a
// preview of the server-drawn PNG with Send, Copy image and Save.
import "../styles/view-export.css";
import type { ViewExportQuery } from "@taff/schemas";
import { ImageDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isLocale } from "../lib/i18n";
import { showToast } from "../lib/toast";
import { Button } from "./ui/button";
import { SheetDialog } from "./ui/sheet-dialog";

type Ready = { url: string; file: File; width: number | null };
type State =
  | { kind: "loading" }
  | { kind: "failed"; unavailable: boolean }
  | ({ kind: "ready" } & Ready);
type ExportProps = { workspaceId: string } & Omit<ViewExportQuery, "locale">;

/** The download name the API sets; a safe fallback otherwise. */
export function exportFileName(disposition: string | null): string {
  const match = disposition?.match(/filename="([A-Za-z0-9._-]{1,120})"/);
  return match?.[1] ?? "taff-view.png";
}

export function canShareFile(file: File): boolean {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

export function ViewExportButton({ workspaceId, ...options }: ExportProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="view-export-open button-quiet"
        data-testid="view-export-open"
        aria-label={t("viewExport.button")}
        title={t("viewExport.button")}
        onClick={() => setOpen(true)}
      >
        <ImageDown size={20} aria-hidden="true" />
        <span className="view-export-open-label">{t("viewExport.button")}</span>
      </Button>
      {open && (
        <ViewExportDialog
          workspaceId={workspaceId}
          {...options}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ViewExportDialog({
  workspaceId,
  onClose,
  ...options
}: ExportProps & {
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const parameters = new URLSearchParams({ locale });
  for (const [key, value] of Object.entries(options))
    if (value !== undefined)
      parameters.set(
        key,
        Array.isArray(value) ? value.join(",") : String(value),
      );
  const search = parameters.toString();
  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    setState({ kind: "loading" });
    (async () => {
      try {
        const response = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/view-image?${search}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/png")
        ) {
          setState({ kind: "failed", unavailable: response.status === 503 });
          return;
        }
        const blob = await response.blob();
        const file = new File(
          [blob],
          exportFileName(response.headers.get("content-disposition")),
          { type: "image/png" },
        );
        url = URL.createObjectURL(blob);
        setState({ kind: "ready", url, file, width: null });
      } catch {
        if (!controller.signal.aborted)
          setState({ kind: "failed", unavailable: false });
      }
    })();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [workspaceId, search]);

  const ready = state.kind === "ready" ? state : null;
  const shareable = ready ? canShareFile(ready.file) : false;
  const copyable =
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function";
  const size = ready
    ? new Intl.NumberFormat(locale, {
        style: "unit",
        unit: "kilobyte",
        maximumFractionDigits: 0,
      }).format(Math.max(1, Math.round(ready.file.size / 1024)))
    : "";

  async function send() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await navigator.share({ files: [ready.file] });
    } catch {
      // A dismissed share sheet is not an error worth announcing.
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": ready.file }),
      ]);
      showToast(t("viewExport.copied"));
    } catch {
      showToast(t("viewExport.copyFailed"));
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (!ready) return;
    const anchor = document.createElement("a");
    anchor.href = ready.url;
    anchor.download = ready.file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <SheetDialog
      title={t("viewExport.title")}
      onClose={onClose}
      className="view-export-dialog"
    >
      <div data-testid="view-export-dialog" className="view-export-body">
        {state.kind === "loading" && (
          <p className="view-export-status" data-testid="view-export-status">
            {t("viewExport.preparing")}
          </p>
        )}
        {state.kind === "failed" && (
          <p
            className="view-export-status"
            data-testid="view-export-status"
            role="alert"
          >
            {t(
              state.unavailable
                ? "viewExport.unavailable"
                : "viewExport.failed",
            )}
          </p>
        )}
        {ready && (
          <>
            <div className="view-export-frame">
              <img
                src={ready.url}
                alt={t("viewExport.alt")}
                data-testid="view-export-preview"
                onLoad={(event) => {
                  const width = event.currentTarget.naturalWidth;
                  setState((current) =>
                    current.kind === "ready" ? { ...current, width } : current,
                  );
                }}
              />
            </div>
            <p className="view-export-size" data-testid="view-export-size">
              {ready.width
                ? t("viewExport.size", { width: ready.width, size })
                : size}
            </p>
            <div className="view-export-actions">
              {shareable && (
                <Button
                  className="button-primary"
                  data-testid="view-export-send"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {t("viewExport.send")}
                </Button>
              )}
              {copyable && (
                <Button
                  data-testid="view-export-copy"
                  disabled={busy}
                  onClick={() => void copy()}
                >
                  {t("viewExport.copy")}
                </Button>
              )}
              <Button
                className={shareable ? "" : "button-primary"}
                data-testid="view-export-save"
                onClick={save}
              >
                {t("viewExport.save")}
              </Button>
            </div>
          </>
        )}
      </div>
    </SheetDialog>
  );
}
