"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDesktop } from "../lib/use-desktop";
import { useWorkspace } from "./app-shell";
import { BriefView } from "./brief-view";

/**
 * `/brief`: a full-screen overlay over 我的 on phone (the `@modal` intercept
 * keeps 我的 underneath; a direct visit renders it). Desktop shows the brief
 * as the Me tab, so the route moves there.
 */
export function BriefRoute({ direct = false }: { direct?: boolean }) {
  const { confirmed } = useWorkspace();
  const router = useRouter();
  const desktop = useDesktop();
  useEffect(() => {
    if (desktop) router.replace("/me?tab=brief");
  }, [desktop, router]);
  if (!confirmed || desktop) return null;
  return (
    <BriefOverlay
      onClose={() => (direct ? router.replace("/me") : router.back())}
    />
  );
}

/** A modal dialog: it traps focus, closes on Escape and restores focus. */
function BriefOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      const back =
        previous instanceof HTMLElement && previous.isConnected
          ? previous
          : document.querySelector<HTMLElement>('[data-testid="me-brief"]');
      back?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="brief-overlay"
      aria-label={t("brief.title")}
      data-testid="brief-overlay"
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
    >
      <BriefView onClose={() => close.current()} as="h1" />
    </dialog>
  );
}
