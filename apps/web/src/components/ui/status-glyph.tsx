import type { TaskStatus } from "@taff/schemas/base";
import { Check, Circle, CircleDot } from "lucide-react";

/** The prototype's compact task state; the adjacent text supplies its name. */
export function StatusGlyph({ status }: { status: TaskStatus }) {
  const Icon =
    status === "done" ? Check : status === "needs_review" ? CircleDot : Circle;
  return (
    <span className={`status-glyph status-glyph-${status}`} aria-hidden="true">
      <Icon size={14} strokeWidth={1.5} />
    </span>
  );
}
