/// Error type shared across the Rust backend. Mirrors the shape of the
/// TypeScript `CoreError` (a machine code plus an HTTP status) so adapters can
/// map it to the same wire representation.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("invalid_input")]
    InvalidInput,
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("not_found")]
    NotFound,
    #[error("conflict")]
    Conflict,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl CoreError {
    /// HTTP status the REST adapter should emit, matching the Hono handlers.
    pub fn status(&self) -> u16 {
        match self {
            CoreError::InvalidInput => 400,
            CoreError::Unauthorized => 401,
            CoreError::Forbidden => 403,
            CoreError::NotFound => 404,
            CoreError::Conflict => 409,
            CoreError::Database(_) | CoreError::Other(_) => 500,
        }
    }

    /// Machine code used in the JSON error envelope (`error`), matching the
    /// existing API (`internal_error`, `invalid_input`, …).
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::InvalidInput => "invalid_input",
            CoreError::Unauthorized => "unauthorized",
            CoreError::Forbidden => "forbidden",
            CoreError::NotFound => "not_found",
            CoreError::Conflict => "conflict",
            CoreError::Database(_) | CoreError::Other(_) => "internal_error",
        }
    }
}

pub type Result<T> = std::result::Result<T, CoreError>;
