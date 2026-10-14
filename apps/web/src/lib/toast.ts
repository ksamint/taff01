/**
 * One app-wide toast, shown on phone and desktop alike (plan §2.4 item 3).
 * Undo is an action that calls the inverse API operation, never a snapshot.
 */
export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; text: string; action?: ToastAction };

const DURATION_MS = 3600;
let current: Toast | null = null;
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}
export function showToast(text: string, action?: ToastAction): number {
  clearTimeout(timer);
  current = { id: ++sequence, text, action };
  emit();
  const id = current.id;
  timer = setTimeout(() => dismissToast(id), DURATION_MS);
  return id;
}
export function dismissToast(id?: number) {
  if (!current || (id !== undefined && current.id !== id)) return;
  clearTimeout(timer);
  current = null;
  emit();
}
/** Keeps the toast open while the pointer or focus is on it. */
export function holdToast(hold: boolean) {
  clearTimeout(timer);
  if (!hold && current) {
    const id = current.id;
    timer = setTimeout(() => dismissToast(id), DURATION_MS);
  }
}
export function subscribeToast(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const readToast = () => current;
