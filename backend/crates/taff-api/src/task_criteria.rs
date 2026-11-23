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
use taff_contract::{TaskCriteriaReorder, TaskCriterionEdit, TaskCriterionInput};
use taff_domain::CoreError;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CriteriaQuery {
    task_id: Uuid,
}

pub(crate) async fn list(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    query: Result<Query<CriteriaQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let criteria = state
        .db
        .task_criteria(&session.user_id, query.task_id)
        .await
        .map_err(ApiError)?;
    Ok((
        [(header::CACHE_CONTROL, "private, no-store")],
        Json(criteria),
    ))
}

pub(crate) async fn create(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    input: Result<Json<TaskCriterionInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let criterion = state
        .db
        .create_criterion(&session.user_id, input)
        .await
        .map_err(ApiError)?;
    Ok((StatusCode::CREATED, Json(criterion)))
}

pub(crate) async fn edit(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
    input: Result<Json<TaskCriterionEdit>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let criterion = state
        .db
        .edit_criterion(&session.user_id, id, input.text)
        .await
        .map_err(ApiError)?;
    Ok(Json(criterion))
}

pub(crate) async fn reorder(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    input: Result<Json<TaskCriteriaReorder>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let criteria = state
        .db
        .reorder_criteria(&session.user_id, input)
        .await
        .map_err(ApiError)?;
    Ok(Json(criteria))
}

pub(crate) async fn check(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let criterion = state
        .db
        .set_criterion_checked(&session.user_id, id, true)
        .await
        .map_err(ApiError)?;
    Ok(Json(criterion))
}

pub(crate) async fn uncheck(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let criterion = state
        .db
        .set_criterion_checked(&session.user_id, id, false)
        .await
        .map_err(ApiError)?;
    Ok(Json(criterion))
}
