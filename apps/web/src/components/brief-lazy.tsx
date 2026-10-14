"use client";
import dynamic from "next/dynamic";

/** The brief is its own chunk; Today's initial JS never includes it. */
export const LazyBriefRoute = dynamic(
  () => import("./brief-route").then((module) => module.BriefRoute),
  { ssr: false, loading: () => null },
);
