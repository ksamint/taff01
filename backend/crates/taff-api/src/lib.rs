use axum::{
    Json, Router,
    extract::FromRequestParts,
    http::{StatusCode, header, request::Parts},
    response::{IntoResponse, Response},
    routing::get,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use hmac::{Hmac, Mac};
use percent_encoding::percent_decode_str;
use serde_json::json;
use sha2::Sha256;
use std::sync::Arc;
use taff_contract::rest::get_api_health::Response200;
use taff_db::{Db, Session};
use taff_domain::CoreError;

#[derive(Clone)]
pub struct AppState {
    db: Db,
    auth_secret: Arc<[u8]>,
    cookie_name: &'static str,
}

impl AppState {
    pub fn new(db: Db, auth_secret: String, auth_url: &url::Url) -> anyhow::Result<Self> {
        anyhow::ensure!(
            auth_secret.len() >= 32,
            "AUTH_SECRET must be at least 32 bytes"
        );
        let cookie_name = match auth_url.scheme() {
            "http" => "better-auth.session_token",
            "https" => "__Secure-better-auth.session_token",
            _ => anyhow::bail!("AUTH_URL must use http or https"),
        };
        Ok(Self {
            db,
            auth_secret: Arc::from(auth_secret.into_bytes()),
            cookie_name,
        })
    }
}

fn verify_cookie(headers: &axum::http::HeaderMap, state: &AppState) -> Option<String> {
    let value = headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|header| header.to_str().ok())
        .flat_map(|header| header.split(';'))
        .filter_map(|pair| pair.split_once('='))
        .find_map(|(name, value)| (name.trim() == state.cookie_name).then_some(value.trim()))?;
    let value = value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(value);
    let decoded = percent_decode_str(value).decode_utf8().ok()?;
    let (token, signature) = decoded.rsplit_once('.')?;
    if token.is_empty() || signature.len() != 44 || !signature.ends_with('=') {
        return None;
    }
    let signature = STANDARD.decode(signature).ok()?;
    let mut hmac = Hmac::<Sha256>::new_from_slice(&state.auth_secret).ok()?;
    hmac.update(token.as_bytes());
    hmac.verify_slice(&signature).ok()?;
    Some(token.to_owned())
}

/// Reads an existing session; the Node API remains the authority for cookies.
pub struct AuthenticatedSession(pub Session);

impl FromRequestParts<AppState> for AuthenticatedSession {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token =
            verify_cookie(&parts.headers, state).ok_or(ApiError(CoreError::Unauthorized))?;
        let session = state
            .db
            .active_session(&token)
            .await
            .map_err(ApiError)?
            .ok_or(ApiError(CoreError::Unauthorized))?;
        Ok(Self(session))
    }
}

pub struct ApiError(pub CoreError);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status =
            StatusCode::from_u16(self.0.status()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        (status, Json(json!({ "error": self.0.code() }))).into_response()
    }
}

async fn health() -> Json<Response200> {
    Json(Response200 {
        status: "ok".into(),
    })
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/health", get(health))
        .fallback(|| async { ApiError(CoreError::NotFound) })
}
