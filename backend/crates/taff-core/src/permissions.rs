//! Port of `packages/core/src/permissions.ts` — the single permission gate
//! `can(actor, action, resource)`. Mirrors the TypeScript logic exactly so a
//! parity test can assert identical decisions.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MemberKind {
    #[default]
    Person,
    Agent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub enum Role {
    Admin,
    #[default]
    Member,
    Guest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    TasksRead,
    TasksWrite,
    CalendarWrite,
    InboxReview,
    FilesWrite,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Todo,
    InProgress,
    NeedsReview,
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capability {
    TasksRead,
    TasksWrite,
    ProjectsManage,
    CalendarSchedule,
    FilesAttach,
    WebSearch,
    RepoRead,
    RepoPr,
    RepoMerge,
    DeployProd,
    StagingRead,
    StagingWrite,
    Alerts,
    CrmRead,
    CrmWrite,
    CrmContactDetails,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionDecision {
    Allow,
    Ask,
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ReviewPolicy {
    AlwaysReview,
    #[default]
    AskOnly,
}

/// An actor: a workspace member (person or agent), possibly carrying an agent
/// token's scopes, permissions and grants.
#[derive(Debug, Clone, Default)]
pub struct Actor {
    pub id: String,
    pub workspace_id: String,
    pub user_id: Option<String>,
    pub name: String,
    pub kind: MemberKind,
    pub role: Role,
    pub system_admin: bool,
    pub scopes: Vec<Scope>,
    pub permissions: Vec<(Capability, PermissionDecision)>,
    pub grants: Vec<Grant>,
    pub review_policy: ReviewPolicy,
}

#[derive(Debug, Clone)]
pub struct Grant {
    pub capability: Capability,
    pub task_id: Option<String>,
    pub run_id: Option<String>,
    pub status: GrantStatus,
    pub expires_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GrantStatus {
    Allowed,
    Other,
}

/// Action and resource, mirroring the discriminated union in the TS source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    WorkspaceArchive,
    WorkspaceDefault,
    WorkspaceCreate,
    WorkspaceJoin,
    WorkspaceManage,
    ProjectManage,
    ProjectStage,
    TaskEdit,
    TaskOwner,
    TaskComment,
    WorkspaceRead,
    TaskCreate,
    TaskAssign,
    TaskStatus,
    TaskSchedule,
    TaskReview,
    TokenManage,
    TokenConnect,
    TokenRevoke,
    ProfileRead,
    ProfileUpdate,
    NotificationRead,
    NotificationUpdate,
    DigestRead,
    RunStart,
    RunControl,
    RunSubmit,
    RunRequestReview,
    FilesAttach,
    AgentManage,
    GrantRequest,
    GrantDecide,
    InboxRead,
    InboxUpdate,
    CapabilityUse,
    ReviewComment,
    TaskFinish,
    DependencyEdit,
    FinanceRead,
    FinanceManage,
    ContactRead,
    ContactDetails,
    ContactManage,
    CrmArchive,
    CrmAudit,
    SuggestionCreate,
    SuggestionDecide,
    SuggestionUndo,
    MindWrite,
    MindArchive,
}

#[derive(Debug, Clone, Default)]
pub struct Resource {
    pub workspace_id: Option<String>,
    pub user_id: Option<String>,
    pub approved_project_operation: Option<bool>,
    pub owner_id: Option<String>,
    pub oauth_grant: Option<bool>,
    pub lead_id: Option<String>,
    pub worker_id: Option<String>,
    pub to_worker_id: Option<String>,
    pub to: Option<TaskStatus>,
    pub task_id: Option<String>,
    pub run_id: Option<String>,
    pub agent_id: Option<String>,
    pub supervisor_id: Option<String>,
    pub member_id: Option<String>,
    pub capability: Option<Capability>,
    pub requested_review: Option<bool>,
}

const DEFAULT_PERMISSIONS: &[(Capability, PermissionDecision)] = &[
    (Capability::TasksRead, PermissionDecision::Allow),
    (Capability::TasksWrite, PermissionDecision::Allow),
    (Capability::ProjectsManage, PermissionDecision::Deny),
    (Capability::FilesAttach, PermissionDecision::Allow),
    (Capability::CalendarSchedule, PermissionDecision::Allow),
    (Capability::WebSearch, PermissionDecision::Ask),
    (Capability::RepoRead, PermissionDecision::Ask),
    (Capability::RepoPr, PermissionDecision::Ask),
    (Capability::RepoMerge, PermissionDecision::Deny),
    (Capability::DeployProd, PermissionDecision::Deny),
    (Capability::StagingRead, PermissionDecision::Ask),
    (Capability::StagingWrite, PermissionDecision::Ask),
    (Capability::Alerts, PermissionDecision::Ask),
    (Capability::CrmRead, PermissionDecision::Ask),
    (Capability::CrmWrite, PermissionDecision::Deny),
    (Capability::CrmContactDetails, PermissionDecision::Deny),
];

fn capability_scope(capability: Capability) -> Scope {
    match capability {
        Capability::TasksRead => Scope::TasksRead,
        Capability::CalendarSchedule => Scope::CalendarWrite,
        Capability::FilesAttach => Scope::FilesWrite,
        Capability::CrmRead | Capability::CrmWrite | Capability::CrmContactDetails => {
            Scope::TasksRead
        }
        _ => Scope::TasksWrite,
    }
}

fn scope_for(action: Action) -> Option<Scope> {
    match action {
        Action::WorkspaceRead => Some(Scope::TasksRead),
        Action::TaskCreate => Some(Scope::TasksWrite),
        Action::TaskAssign => Some(Scope::TasksWrite),
        Action::TaskStatus => Some(Scope::TasksWrite),
        Action::TaskSchedule => Some(Scope::CalendarWrite),
        _ => None,
    }
}

const AGENT_STATUSES: [TaskStatus; 2] = [TaskStatus::InProgress, TaskStatus::NeedsReview];

fn has_scope(actor: &Actor, scope: Scope) -> bool {
    actor.scopes.contains(&scope)
}

fn default_permission(capability: Capability) -> PermissionDecision {
    DEFAULT_PERMISSIONS
        .iter()
        .find(|(c, _)| *c == capability)
        .map(|(_, d)| *d)
        .unwrap_or(PermissionDecision::Ask)
}

fn permission_decision(actor: &Actor, capability: Capability) -> PermissionDecision {
    actor
        .permissions
        .iter()
        .find(|(c, _)| *c == capability)
        .map(|(_, d)| *d)
        .unwrap_or_else(|| default_permission(capability))
}

/// The core authorization gate. Mirrors `can()` in permissions.ts.
pub fn can(actor: Option<&Actor>, action: Action, resource: &Resource) -> bool {
    let Some(actor) = actor else { return false };

    if action == Action::WorkspaceDefault {
        return actor.kind == MemberKind::Person
            && resource.user_id.is_some()
            && (actor.user_id.as_deref() == resource.user_id.as_deref() || actor.system_admin);
    }
    if action == Action::WorkspaceArchive {
        return actor.kind == MemberKind::Person
            && (actor.system_admin
                || (actor.role == Role::Admin
                    && resource.workspace_id.as_deref() == Some(actor.workspace_id.as_str())));
    }

    if matches!(
        action,
        Action::NotificationRead
            | Action::NotificationUpdate
            | Action::ProfileRead
            | Action::ProfileUpdate
            | Action::WorkspaceCreate
            | Action::WorkspaceJoin
    ) {
        return resource.user_id.is_some()
            && actor.kind == MemberKind::Person
            && actor.user_id.as_deref() == resource.user_id.as_deref();
    }

    // Resource must name the actor's own workspace.
    let Some(resource_ws) = resource.workspace_id.as_deref() else {
        return false;
    };
    if actor.workspace_id != resource_ws {
        return false;
    }

    if actor.role == Role::Guest
        && !matches!(
            action,
            Action::WorkspaceRead | Action::InboxRead | Action::InboxUpdate | Action::DigestRead
        )
    {
        return false;
    }

    if action == Action::ProjectManage {
        return if actor.kind == MemberKind::Person {
            actor.role == Role::Admin
        } else {
            resource.approved_project_operation == Some(true)
                && has_scope(actor, Scope::TasksWrite)
                && can(
                    Some(actor),
                    Action::CapabilityUse,
                    &Resource {
                        capability: Some(Capability::ProjectsManage),
                        ..resource.clone()
                    },
                )
        };
    }

    if matches!(
        action,
        Action::WorkspaceManage
            | Action::FinanceManage
            | Action::CrmArchive
            | Action::CrmAudit
            | Action::MindArchive
    ) {
        return actor.kind == MemberKind::Person && actor.role == Role::Admin;
    }

    if action == Action::TokenConnect {
        return actor.kind == MemberKind::Person
            && (actor.role == Role::Admin
                || resource.supervisor_id.as_deref() == Some(actor.id.as_str()));
    }
    if action == Action::TokenRevoke {
        return actor.kind == MemberKind::Person
            && (actor.role == Role::Admin
                || (resource.oauth_grant == Some(true)
                    && resource.owner_id.as_deref() == Some(actor.id.as_str())));
    }
    if action == Action::ProjectStage {
        return actor.kind == MemberKind::Person
            && (actor.role == Role::Admin
                || resource.lead_id.as_deref() == Some(actor.id.as_str()));
    }
    if action == Action::FinanceRead && actor.kind == MemberKind::Agent {
        return has_scope(actor, Scope::TasksRead)
            && can(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::ProjectsManage),
                    ..resource.clone()
                },
            );
    }
    if matches!(
        action,
        Action::ContactManage | Action::MindWrite | Action::FinanceRead
    ) {
        return actor.kind == MemberKind::Person;
    }
    if action == Action::SuggestionCreate {
        if actor.kind == MemberKind::Person {
            return actor.role == Role::Admin
                || resource.owner_id.as_deref() == Some(actor.id.as_str());
        }
        return actor.kind == MemberKind::Agent
            && resource.worker_id.as_deref() == Some(actor.id.as_str())
            && has_scope(actor, Scope::TasksWrite)
            && can(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::TasksWrite),
                    ..resource.clone()
                },
            );
    }
    if matches!(action, Action::SuggestionDecide | Action::SuggestionUndo) {
        return actor.kind == MemberKind::Person
            && (actor.role == Role::Admin
                || resource.owner_id.as_deref() == Some(actor.id.as_str()));
    }
    if matches!(action, Action::ContactRead | Action::ContactDetails) {
        if actor.kind == MemberKind::Person {
            return true;
        }
        return has_scope(actor, Scope::TasksRead)
            && can(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::CrmRead),
                    ..resource.clone()
                },
            )
            && (action == Action::ContactRead
                || can(
                    Some(actor),
                    Action::CapabilityUse,
                    &Resource {
                        capability: Some(Capability::CrmContactDetails),
                        ..resource.clone()
                    },
                ));
    }
    if action == Action::DependencyEdit {
        if actor.kind == MemberKind::Person {
            return actor.role == Role::Admin
                || resource.owner_id.as_deref() == Some(actor.id.as_str());
        }
        return resource.worker_id.as_deref() == Some(actor.id.as_str())
            && has_scope(actor, Scope::TasksWrite)
            && can(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::TasksWrite),
                    ..resource.clone()
                },
            );
    }

    let owns = actor.role == Role::Admin || resource.owner_id.as_deref() == Some(actor.id.as_str());

    if matches!(
        action,
        Action::TaskEdit | Action::TaskOwner | Action::TaskComment
    ) {
        if actor.kind == MemberKind::Person {
            return action == Action::TaskComment || owns;
        }
        return action != Action::TaskOwner
            && resource.worker_id.as_deref() == Some(actor.id.as_str())
            && can(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::TasksWrite),
                    ..resource.clone()
                },
            );
    }
    if action == Action::AgentManage {
        return actor.kind == MemberKind::Person && actor.role == Role::Admin;
    }
    if action == Action::GrantDecide {
        return actor.kind == MemberKind::Person
            && (actor.role == Role::Admin
                || resource.supervisor_id.as_deref() == Some(actor.id.as_str()));
    }
    if action == Action::GrantRequest {
        return if actor.kind == MemberKind::Agent {
            resource.agent_id.as_deref() == Some(actor.id.as_str())
                && has_scope(
                    actor,
                    capability_scope(resource.capability.unwrap_or(Capability::TasksWrite)),
                )
        } else {
            owns
        };
    }
    if matches!(
        action,
        Action::InboxRead | Action::InboxUpdate | Action::DigestRead
    ) {
        return actor.kind == MemberKind::Person
            && (resource.member_id.is_none()
                || resource.member_id.as_deref() == Some(actor.id.as_str()));
    }
    if action == Action::CapabilityUse {
        if actor.kind == MemberKind::Person {
            return true;
        }
        let Some(capability) = resource.capability else {
            return false;
        };
        let scope = capability_scope(capability);
        if !has_scope(actor, scope) {
            return false;
        }
        match permission_decision(actor, capability) {
            PermissionDecision::Deny => return false,
            PermissionDecision::Allow => return true,
            PermissionDecision::Ask => {}
        }
        let now = now_ms();
        return actor.grants.iter().any(|grant| {
            grant.capability == capability
                && grant.status == GrantStatus::Allowed
                && grant.expires_at_ms.map(|exp| exp > now).unwrap_or(false)
                && (grant.task_id.is_none() || grant.task_id == resource.task_id)
                && (grant.run_id.is_none() || grant.run_id == resource.run_id)
        });
    }

    if matches!(
        action,
        Action::RunStart
            | Action::RunControl
            | Action::RunSubmit
            | Action::RunRequestReview
            | Action::FilesAttach
            | Action::ReviewComment
            | Action::TaskFinish
    ) {
        if actor.kind == MemberKind::Agent {
            if resource.worker_id.as_deref() != Some(actor.id.as_str()) {
                return false;
            }
            let cap = if action == Action::FilesAttach {
                Capability::FilesAttach
            } else {
                Capability::TasksWrite
            };
            if !can(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(cap),
                    ..resource.clone()
                },
            ) {
                return false;
            }
            if action == Action::TaskFinish {
                return actor.review_policy == ReviewPolicy::AskOnly
                    && resource.requested_review == Some(false);
            }
            if action == Action::RunRequestReview {
                return has_scope(actor, Scope::InboxReview);
            }
            return true;
        }
        return action == Action::ReviewComment || owns;
    }

    if actor.kind == MemberKind::Agent {
        if matches!(action, Action::TokenManage | Action::TaskReview) {
            return false;
        }
        let needed = if action == Action::TaskStatus && resource.to == Some(TaskStatus::NeedsReview)
        {
            Scope::InboxReview
        } else {
            let Some(s) = scope_for(action) else {
                return false;
            };
            s
        };
        if !has_scope(actor, needed) {
            return false;
        }
        let capability = match action {
            Action::WorkspaceRead => Capability::TasksRead,
            Action::TaskSchedule => Capability::CalendarSchedule,
            _ => Capability::TasksWrite,
        };
        if !can(
            Some(actor),
            Action::CapabilityUse,
            &Resource {
                capability: Some(capability),
                ..resource.clone()
            },
        ) {
            return false;
        }
        if action == Action::TaskStatus {
            return resource.to.is_some()
                && AGENT_STATUSES.contains(&resource.to.unwrap())
                && resource.worker_id.as_deref() == Some(actor.id.as_str());
        }
        if action == Action::TaskSchedule {
            return resource.worker_id.as_deref() == Some(actor.id.as_str());
        }
        if action == Action::TaskAssign {
            return if resource.worker_id.as_deref() == Some(actor.id.as_str()) {
                resource.to_worker_id.is_none()
                    || resource.to_worker_id.as_deref() == Some(actor.id.as_str())
            } else {
                resource.worker_id.is_none()
                    && resource.to_worker_id.as_deref() == Some(actor.id.as_str())
            };
        }
        if action == Action::TaskCreate {
            return resource.to_worker_id.is_none()
                || resource.to_worker_id.as_deref() == Some(actor.id.as_str());
        }
        return true;
    }

    match action {
        Action::WorkspaceRead | Action::TaskCreate => true,
        Action::TokenManage => actor.role == Role::Admin,
        Action::TaskAssign | Action::TaskSchedule => owns,
        Action::TaskStatus => {
            resource.to.is_some()
                && (owns || resource.worker_id.as_deref() == Some(actor.id.as_str()))
                && resource.to != Some(TaskStatus::Done)
        }
        Action::TaskReview => owns || resource.supervisor_id.as_deref() == Some(actor.id.as_str()),
        _ => false,
    }
}

/// Logical clock, overridable in tests to control grant expiry.
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub const OAUTH_SCOPE_CEILING: &[(Role, &[Scope])] = &[
    (
        Role::Admin,
        &[
            Scope::TasksRead,
            Scope::TasksWrite,
            Scope::CalendarWrite,
            Scope::InboxReview,
            Scope::FilesWrite,
        ],
    ),
    (
        Role::Member,
        &[
            Scope::TasksRead,
            Scope::TasksWrite,
            Scope::CalendarWrite,
            Scope::InboxReview,
        ],
    ),
    (Role::Guest, &[]),
];

pub fn can_grant_oauth_scopes(
    actor: Option<&Actor>,
    resource: &Resource,
    scopes: &[Scope],
) -> bool {
    match actor {
        None => false,
        Some(actor) => {
            can(Some(actor), Action::TokenConnect, resource)
                && scopes.iter().all(|scope| {
                    OAUTH_SCOPE_CEILING
                        .iter()
                        .find(|(r, _)| *r == actor.role)
                        .map(|(_, allowed)| allowed.contains(scope))
                        .unwrap_or(false)
                })
        }
    }
}

/// Maps a scope to its string name for test assertions / diagnostics.
pub fn scope_name(scope: Scope) -> &'static str {
    match scope {
        Scope::TasksRead => "tasks:read",
        Scope::TasksWrite => "tasks:write",
        Scope::CalendarWrite => "calendar:write",
        Scope::InboxReview => "inbox:review",
        Scope::FilesWrite => "files:write",
    }
}
