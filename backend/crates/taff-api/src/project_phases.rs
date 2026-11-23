use crate::{ApiError, AppState, AuthenticatedSession, SameOrigin};
use axum::{
    Json,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::{StatusCode, header},
    response::IntoResponse,
};
use serde::Deserialize;
use taff_contract::{ProjectPhaseEdit, ProjectPhaseInput};
use taff_domain::CoreError;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ProjectPhaseQuery {
    project_id: Uuid,
}

pub(crate) async fn list(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    query: Result<Query<ProjectPhaseQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let phases = state
        .db
        .project_phases(&session.user_id, query.project_id)
        .await
        .map_err(ApiError)?;
    Ok(([(header::CACHE_CONTROL, "private, no-store")], Json(phases)))
}

pub(crate) async fn create(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    input: Result<Json<ProjectPhaseInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let phase = state
        .db
        .create_project_phase(&session.user_id, input)
        .await
        .map_err(ApiError)?;
    Ok((StatusCode::CREATED, Json(phase)))
}

pub(crate) async fn edit(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
    input: Result<Json<ProjectPhaseEdit>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let phase = state
        .db
        .edit_project_phase(&session.user_id, id, input)
        .await
        .map_err(ApiError)?;
    Ok(Json(phase))
}
