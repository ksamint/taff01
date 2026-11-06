mod calendar;
mod error;
mod permissions;
mod security;
mod tz;

pub use calendar::normalize_rrule;
pub use error::{CoreError, Result};
pub use permissions::{
    Action, Actor, Capability, Grant, GrantStatus, MemberKind, PermissionDecision, Resource,
    ReviewPolicy, Role, Scope, TaskStatus, can, can_at, can_grant_oauth_scopes, scope_name,
};
pub use security::{canonical_json, hash_token, js_number_to_string};
pub use tz::{CivilDateTime, Zone, civil_datetime, wall_to_instant};

#[cfg(test)]
mod tests {
    use super::*;

    /// No live database required at unit-test time: assert the error
    /// envelope maps to the same machine codes and statuses the API emits.
    #[test]
    fn error_codes_match_the_wire_contract() {
        assert_eq!(CoreError::InvalidInput.status(), 400);
        assert_eq!(CoreError::InvalidInput.code(), "invalid_input");
        assert_eq!(CoreError::Unauthorized.status(), 401);
        assert_eq!(CoreError::Forbidden.status(), 403);
        assert_eq!(CoreError::NotFound.status(), 404);
        assert_eq!(CoreError::Conflict.status(), 409);
        assert_eq!(CoreError::RateLimited.status(), 429);
        assert_eq!(CoreError::RateLimited.code(), "rate_limited");
        assert_eq!(
            CoreError::Other(anyhow::anyhow!("database unavailable")).status(),
            500
        );
    }
}
