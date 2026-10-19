import type { ToolAnnotations } from "@modelcontextprotocol/server";

// MCP tool hints (spec 2025-11-25 and 2026-07-28). Clients use them to skip
// confirmation for reads and to warn before changes. They are hints only:
// core's can() and token scopes still decide every call. Taff is a closed
// system, so no tool reaches the open world.

/** Reads; calling again changes nothing. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
/** Adds a new record (task, comment, event, artifact, request, proposal). */
export const ADDITIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
/**
 * Overwrites or removes existing state (status, fields, dates, links, run
 * control). Versioned or value-setting, so repeating it adds no effect.
 */
export const UPDATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
