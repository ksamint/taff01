import type { ComponentProps } from "react";
import "../../styles/switch.css";

export function Switch({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      type="checkbox"
      role="switch"
      className={`ui-switch ${className}`}
    />
  );
}
