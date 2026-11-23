mod project_actual;
mod project_health;
mod task_criteria;
mod task_links;
mod time_tracking;

use axum::{
    Json, Router,
    extract::{FromRequestParts, Path, State, rejection::PathRejection},
    http::{StatusCode, header, request::Parts},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use hmac::{Hmac, Mac};
use percent_encoding::percent_decode_str;
use serde_json::json;
use sha2::Sha256;
use std::sync::Arc;
use taff_contract::{AgentCost, rest::get_api_health::Response200};
use taff_db::{CostTarget, Db, Session};
use taff_domain::CoreError;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    db: Db,
    auth_secret: Arc<[u8]>,
    cookie_name: &'static str,
    auth_origin: String,
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
            auth_origin: auth_url.origin().ascii_serialization(),
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

pub(crate) struct SameOrigin;

impl FromRequestParts<AppState> for SameOrigin {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        if let Some(origin) = parts.headers.get(header::ORIGIN)
            && origin != state.auth_origin.as_str()
        {
            return Err(ApiError(CoreError::Forbidden));
        }
        Ok(Self)
    }
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

async fn task_cost(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    state
        .db
        .agent_cost(&session.user_id, CostTarget::Task(id))
        .await
        .map(cost_response)
        .map_err(ApiError)
}

async fn project_cost(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    state
        .db
        .agent_cost(&session.user_id, CostTarget::Project(id))
        .await
        .map(cost_response)
        .map_err(ApiError)
}

fn cost_response(cost: AgentCost) -> impl IntoResponse {
    ([(header::CACHE_CONTROL, "private, no-store")], Json(cost))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/costs/tasks/{id}", get(task_cost))
        .route("/api/costs/projects/{id}", get(project_cost))
        .route(
            "/api/costs/projects/{id}/actual",
            get(project_actual::actual),
        )
        .route(
            "/api/costs/projects/{id}/budget",
            post(project_actual::set_budget),
        )
        .route(
            "/api/costs/projects/{id}/margin",
            get(project_actual::margin),
        )
        .route(
            "/api/project-updates",
            get(project_health::list).post(project_health::post),
        )
        .route(
            "/api/task-links",
            get(task_links::list).post(task_links::create),
        )
        .route("/api/task-links/{id}", delete(task_links::remove))
        .route(
            "/api/task-criteria",
            get(task_criteria::list).post(task_criteria::create),
        )
        .route("/api/task-criteria/reorder", post(task_criteria::reorder))
        .route("/api/task-criteria/{id}", patch(task_criteria::edit))
        .route("/api/task-criteria/{id}/check", post(task_criteria::check))
        .route(
            "/api/task-criteria/{id}/uncheck",
            post(task_criteria::uncheck),
        )
        .route(
            "/api/time-entries",
            get(time_tracking::entries).post(time_tracking::create_entry),
        )
        .route(
            "/api/time-entries/{id}",
            patch(time_tracking::edit_entry).delete(time_tracking::delete_entry),
        )
        .route(
            "/api/member-rates",
            get(time_tracking::rates).post(time_tracking::upsert_rate),
        )
        .fallback(|| async { ApiError(CoreError::NotFound) })
}
