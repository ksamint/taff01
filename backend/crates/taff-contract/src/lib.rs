//! Wire types generated from the committed TypeScript JSON Schema contracts.
//!
//! Validate inputs with the original schema before deserializing. For PATCH
//! fields where omission and null have different meanings, keep the raw JSON
//! until the caller applies the field-level update.
// Typify can emit unused defaults and other lintable code as part of its output.
#[allow(dead_code, clippy::all)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/contracts.rs"));
}

pub use generated::{mcp, render, rest};
