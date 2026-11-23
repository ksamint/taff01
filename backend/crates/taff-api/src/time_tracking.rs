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
use taff_contract::{MemberRateInput, TimeEntryEdit, TimeEntryInput};
use taff_db::PersonalRecordsScope;
use taff_domain::CoreError;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct EntryQuery {
    workspace_id: Uuid,
    task_id: Option<Uuid>,
    person_id: Option<Uuid>,
    #[serde(default)]
    all: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RateQuery {
    workspace_id: Uuid,
    person_id: Option<Uuid>,
    #[serde(default)]
    all: bool,
}

pub(crate) async fn entries(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    query: Result<Query<EntryQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let scope = PersonalRecordsScope {
        workspace_id: query.workspace_id,
        person_id: query.person_id,
        all: query.all,
    };
    let result = state
        .db
        .time_entries(&session.user_id, scope, query.task_id)
        .await
        .map_err(ApiError)?;
    Ok(([(header::CACHE_CONTROL, "private, no-store")], Json(result)))
}

pub(crate) async fn create_entry(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    input: Result<Json<TimeEntryInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let result = state
        .db
        .create_time_entry(&session.user_id, input)
        .await
        .map_err(ApiError)?;
    Ok((StatusCode::CREATED, Json(result)))
}

pub(crate) async fn edit_entry(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
    input: Result<Json<TimeEntryEdit>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let result = state
        .db
        .edit_time_entry(&session.user_id, id, input)
        .await
        .map_err(ApiError)?;
    Ok(Json(result))
}

pub(crate) async fn delete_entry(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<StatusCode, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    state
        .db
        .delete_time_entry(&session.user_id, id)
        .await
        .map_err(ApiError)?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn rates(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    query: Result<Query<RateQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let scope = PersonalRecordsScope {
        workspace_id: query.workspace_id,
        person_id: query.person_id,
        all: query.all,
    };
    let result = state
        .db
        .member_rates(&session.user_id, scope)
        .await
        .map_err(ApiError)?;
    Ok(([(header::CACHE_CONTROL, "private, no-store")], Json(result)))
}

pub(crate) async fn upsert_rate(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    input: Result<Json<MemberRateInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let result = state
        .db
        .upsert_member_rate(&session.user_id, input)
        .await
        .map_err(ApiError)?;
    Ok(([(header::CACHE_CONTROL, "private, no-store")], Json(result)))
}
