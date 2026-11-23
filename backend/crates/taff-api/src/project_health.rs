use crate::{ApiError, AppState, AuthenticatedSession, SameOrigin};
use axum::{
    Json,
    extract::{
        Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{StatusCode, header},
    response::IntoResponse,
};
use serde::Deserialize;
use taff_contract::ProjectHealthInput;
use taff_domain::CoreError;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HealthQuery {
    project_id: Uuid,
    before: Option<Uuid>,
}

pub(crate) async fn list(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    query: Result<Query<HealthQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let page = state
        .db
        .project_health(&session.user_id, query.project_id, query.before)
        .await
        .map_err(ApiError)?;
    Ok(([(header::CACHE_CONTROL, "private, no-store")], Json(page)))
}

pub(crate) async fn post(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    input: Result<Json<ProjectHealthInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let update = state
        .db
        .post_project_health(&session.user_id, input)
        .await
        .map_err(ApiError)?;
    Ok((StatusCode::CREATED, Json(update)))
}
