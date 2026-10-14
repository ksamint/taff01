"use client";

import { useSyncExternalStore } from "react";
import {
  dismissToast,
  holdToast,
  readToast,
  subscribeToast,
} from "../../lib/toast";

/** Live region for optimistic results; rendered once by the shell on both layouts. */
export function Toaster() {
  const toast = useSyncExternalStore(subscribeToast, readToast, () => null);
  return (
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
}
