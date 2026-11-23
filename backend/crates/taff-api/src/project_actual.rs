use crate::{ApiError, AppState, AuthenticatedSession, SameOrigin};
use axum::{
    Json,
    extract::{
        Path, State,
        rejection::{JsonRejection, PathRejection},
    },
    http::header,
    response::IntoResponse,
};
use taff_contract::ProjectBudget;
use taff_domain::CoreError;
use uuid::Uuid;

pub(crate) async fn actual(
    State(state): State<AppState>,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let actual = state
        .db
        .project_actual(&session.user_id, id)
        .await
        .map_err(ApiError)?;
    Ok(([(header::CACHE_CONTROL, "private, no-store")], Json(actual)))
}

pub(crate) async fn margin(
    State(state): State<AppState>,
    session: Result<AuthenticatedSession, ApiError>,
    path: Result<Path<Uuid>, PathRejection>,
) -> impl IntoResponse {
    let margin = async {
        let AuthenticatedSession(session) = session?;
        let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
        state
            .db
            .project_margin(&session.user_id, id)
            .await
            .map(Json)
            .map_err(ApiError)
    }
    .await;
    ([(header::CACHE_CONTROL, "private, no-store")], margin)
}

pub(crate) async fn set_budget(
    State(state): State<AppState>,
    _: SameOrigin,
    AuthenticatedSession(session): AuthenticatedSession,
    path: Result<Path<Uuid>, PathRejection>,
    input: Result<Json<ProjectBudget>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Path(id) = path.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let Json(input) = input.map_err(|_| ApiError(CoreError::InvalidInput))?;
    let budget = state
        .db
        .set_project_budget(&session.user_id, id, input)
        .await
        .map_err(ApiError)?;
    Ok(([(header::CACHE_CONTROL, "private, no-store")], Json(budget)))
}
