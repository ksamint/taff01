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
use taff_contract::TaskLinkInput;
use taff_domain::CoreError;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TaskLinksQuery {
    task_id: Uuid,
}

pub(crate) async fn list(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    query: Result<Query<TaskLinksQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let links = state
        .db
        .task_links(&session.user_id, query.task_id)
        .await
        .map_err(ApiError)?;
    Ok(([(header::CACHE_CONTROL, "private, no-store")], Json(links)))
}

pub(crate) async fn create(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    input: Result<Json<TaskLinkInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let link = state
        .db
        .create_task_link(&session.user_id, input)
        .await
        .map_err(ApiError)?;
    Ok((StatusCode::CREATED, Json(link)))
}

pub(crate) async fn remove(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    state
        .db
        .delete_task_link(&session.user_id, id)
        .await
        .map_err(ApiError)?;
    Ok(StatusCode::NO_CONTENT)
}
