use crate::{ApiError, AppState, AuthenticatedSession};
use axum::{
    Json,
    extract::{Path, State, rejection::PathRejection},
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use taff_contract::rest::{
    get_api_projects_id_milestones, get_api_projects_id_payments, get_api_projects_id_timeline,
};
use taff_domain::CoreError;
use uuid::{Uuid, Variant};

fn project_id(path: Result<Path<String>, PathRejection>) -> Result<(String, Uuid), ApiError> {
    let Path(raw) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let id = Uuid::parse_str(&raw).map_err(|_| ApiError(CoreError::InvalidInput))?;
    let rfc = (1..=8).contains(&id.get_version_num()) && id.get_variant() == Variant::RFC4122;
    let sentinel = id.is_nil() || raw == "ffffffff-ffff-ffff-ffff-ffffffffffff";
    if raw.len() != 36 || !(rfc || sentinel) {
        return Err(ApiError(CoreError::InvalidInput));
    }
    Ok((raw, id))
}

fn wire<T: DeserializeOwned>(value: Value) -> Result<Json<T>, ApiError> {
    serde_json::from_value(value)
        .map(Json)
        .map_err(|error| ApiError(CoreError::Other(error.into())))
}

pub(crate) async fn timeline(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<String>, PathRejection>,
) -> Result<Json<get_api_projects_id_timeline::Response200>, ApiError> {
    let (raw, id) = project_id(path)?;
    let mut timeline = state
        .db
        .project_timeline(&session.user_id, id)
        .await
        .map_err(ApiError)?;
    timeline["projectId"] = Value::String(raw);
    wire(timeline)
}

pub(crate) async fn milestones(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<String>, PathRejection>,
) -> Result<Json<get_api_projects_id_milestones::Response200>, ApiError> {
    let (_, id) = project_id(path)?;
    wire(
        state
            .db
            .project_milestones(&session.user_id, id)
            .await
            .map_err(ApiError)?,
    )
}

pub(crate) async fn payments(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<String>, PathRejection>,
) -> Result<Json<get_api_projects_id_payments::Response200>, ApiError> {
    let (_, id) = project_id(path)?;
    wire(
        state
            .db
            .project_payments(&session.user_id, id)
            .await
            .map_err(ApiError)?,
    )
}
