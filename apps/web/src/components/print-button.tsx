"use client";
import { Printer } from "lucide-react";
import { Button } from "./ui/button";

/** The public share page's only client code: print or save as PDF. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button data-testid="share-print" onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" /> {label}
    </Button>
  );
}
