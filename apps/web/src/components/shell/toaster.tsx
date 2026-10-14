"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  dismissToast,
  holdToast,
  readToast,
  subscribeToast,
} from "../../lib/toast";

/** The open modal dialog on top, if any: everything outside it is inert. */
function topDialog() {
  const open = document.querySelectorAll("dialog[open]");
  return open[open.length - 1] ?? null;
}

/**
 * Live region for optimistic results; rendered once by the shell on both
 * layouts. While a modal sheet is open (the phone task detail) the toast
 * renders inside it, so its 撤銷 stays visible and focusable.
 */
export function Toaster() {
  const toast = useSyncExternalStore(subscribeToast, readToast, () => null);
  const [host, setHost] = useState<Element | null>(null);
  const id = toast?.id;
  useEffect(() => {
    setHost(id === undefined ? null : topDialog());
  }, [id]);
  const region = (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toast && (
        <div
          key={toast.id}
          className="toast"
          data-testid="toast"
          role="status"
          onPointerEnter={() => holdToast(true)}
          onPointerLeave={() => holdToast(false)}
          onFocus={() => holdToast(true)}
          onBlur={() => holdToast(false)}
        >
          <span className="toast-text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              data-testid="toast-action"
              onClick={() => {
                const action = toast.action;
                dismissToast(toast.id);
                action?.run();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
  return host?.isConnected ? createPortal(region, host) : region;
}
