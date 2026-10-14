"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDesktop } from "../lib/use-desktop";
import { useWorkspace } from "./app-shell";
import { BriefView } from "./brief-view";

/** Set by the 我的 row so closing goes back instead of adding history. */
const BRIEF_BACK_KEY = "taff:brief-back";

function cameFromMe() {
  try {
    const back = window.sessionStorage.getItem(BRIEF_BACK_KEY) === "1";
    window.sessionStorage.removeItem(BRIEF_BACK_KEY);
    return back;
  } catch {
    return false;
  }
}

/**
 * `/brief`: a full-screen overlay over 我的 on phone. The route renders 我的
 * underneath itself (no `@modal` intercept: it grew Today's shared JS by
 * about 1.4 KB). Desktop shows the brief as the Me tab, so it moves there.
 */
export function BriefRoute() {
  const { confirmed } = useWorkspace();
  const router = useRouter();
  const desktop = useDesktop();
  useEffect(() => {
    if (desktop) router.replace("/me?tab=brief");
  }, [desktop, router]);
  if (!confirmed || desktop) return null;
  return (
    <BriefOverlay
      onClose={() => (cameFromMe() ? router.back() : router.replace("/me"))}
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
      // The opener lives on 我的, which remounts after the route changes:
      // wait a few frames for the connected row, then restore focus to it.
      let frames = 0;
      const restore = () => {
        const back =
          previous instanceof HTMLElement && previous.isConnected
            ? previous
            : document.querySelector<HTMLElement>('[data-testid="me-brief"]');
        if (back?.isConnected && !back.closest("dialog")) back.focus();
        if (document.activeElement !== back && ++frames < 30)
          requestAnimationFrame(restore);
      };
      requestAnimationFrame(restore);
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
