//! Port of `packages/core/src/permissions.ts` — the single permission gate
//! `can(actor, action, resource)`. Mirrors the TypeScript logic exactly so a
//! parity test can assert identical decisions.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Deserialize)]
pub enum MemberKind {
    #[default]
    #[serde(rename = "person")]
    Person,
    #[serde(rename = "agent")]
    Agent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, serde::Deserialize)]
pub enum Role {
    #[serde(rename = "admin")]
    Admin,
    #[default]
    #[serde(rename = "member")]
    Member,
    #[serde(rename = "guest")]
    Guest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
pub enum Scope {
    #[serde(rename = "tasks:read")]
    TasksRead,
    #[serde(rename = "tasks:write")]
    TasksWrite,
    #[serde(rename = "calendar:write")]
    CalendarWrite,
    #[serde(rename = "inbox:review")]
    InboxReview,
    #[serde(rename = "files:write")]
    FilesWrite,
    #[serde(rename = "summaries:read")]
    SummariesRead,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
pub enum TaskStatus {
    #[serde(rename = "todo")]
    Todo,
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "needs_review")]
    NeedsReview,
    #[serde(rename = "done")]
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
pub enum Capability {
    #[serde(rename = "tasks.read")]
    TasksRead,
    #[serde(rename = "tasks.write")]
    TasksWrite,
    #[serde(rename = "projects.manage")]
    ProjectsManage,
    #[serde(rename = "calendar.schedule")]
    CalendarSchedule,
    #[serde(rename = "files.attach")]
    FilesAttach,
    #[serde(rename = "web.search")]
    WebSearch,
    #[serde(rename = "repo.read")]
    RepoRead,
    #[serde(rename = "repo.pr")]
    RepoPr,
    #[serde(rename = "repo.merge")]
    RepoMerge,
    #[serde(rename = "deploy.prod")]
    DeployProd,
    #[serde(rename = "staging.read")]
    StagingRead,
    #[serde(rename = "staging.write")]
    StagingWrite,
    #[serde(rename = "alerts")]
    Alerts,
    #[serde(rename = "crm.read")]
    CrmRead,
    #[serde(rename = "crm.write")]
    CrmWrite,
    #[serde(rename = "crm.contact_details")]
    CrmContactDetails,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
pub enum PermissionDecision {
    #[serde(rename = "allow")]
    Allow,
    #[serde(rename = "ask")]
    Ask,
    #[serde(rename = "deny")]
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Deserialize)]
pub enum ReviewPolicy {
    #[default]
    #[serde(rename = "always_review")]
    AlwaysReview,
    #[serde(rename = "ask_only")]
    AskOnly,
}

/// An actor: a workspace member (person or agent), possibly carrying an agent
/// token's scopes, permissions and grants.
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
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

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    pub capability: Capability,
    pub task_id: Option<String>,
    pub run_id: Option<String>,
    pub status: GrantStatus,
    pub expires_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
pub enum GrantStatus {
    #[serde(rename = "allowed")]
    Allowed,
    #[serde(rename = "other")]
    Other,
}

/// Action and resource, mirroring the discriminated union in the TS source.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
pub enum Action {
    #[serde(rename = "workspace:archive")]
    WorkspaceArchive,
    #[serde(rename = "workspace:default")]
    WorkspaceDefault,
    #[serde(rename = "workspace:create")]
    WorkspaceCreate,
    #[serde(rename = "workspace:join")]
    WorkspaceJoin,
    #[serde(rename = "workspace:manage")]
    WorkspaceManage,
    #[serde(rename = "project:manage")]
    ProjectManage,
    #[serde(rename = "project:stage")]
    ProjectStage,
    #[serde(rename = "task:edit")]
    TaskEdit,
    #[serde(rename = "task:owner")]
    TaskOwner,
    #[serde(rename = "task:comment")]
    TaskComment,
    #[serde(rename = "workspace:read")]
    WorkspaceRead,
    #[serde(rename = "task:create")]
    TaskCreate,
    #[serde(rename = "task:assign")]
    TaskAssign,
    #[serde(rename = "task:status")]
    TaskStatus,
    #[serde(rename = "task:schedule")]
    TaskSchedule,
    #[serde(rename = "task:review")]
    TaskReview,
    #[serde(rename = "token:manage")]
    TokenManage,
    #[serde(rename = "token:connect")]
    TokenConnect,
    #[serde(rename = "token:revoke")]
    TokenRevoke,
    #[serde(rename = "profile:read")]
    ProfileRead,
    #[serde(rename = "profile:update")]
    ProfileUpdate,
    #[serde(rename = "notification:read")]
    NotificationRead,
    #[serde(rename = "notification:update")]
    NotificationUpdate,
    #[serde(rename = "digest:read")]
    DigestRead,
    #[serde(rename = "run:start")]
    RunStart,
    #[serde(rename = "run:control")]
    RunControl,
    #[serde(rename = "run:submit")]
    RunSubmit,
    #[serde(rename = "run:request_review")]
    RunRequestReview,
    #[serde(rename = "files:attach")]
    FilesAttach,
    #[serde(rename = "agent:manage")]
    AgentManage,
    #[serde(rename = "grant:request")]
    GrantRequest,
    #[serde(rename = "grant:decide")]
    GrantDecide,
    #[serde(rename = "inbox:read")]
    InboxRead,
    #[serde(rename = "inbox:update")]
    InboxUpdate,
    #[serde(rename = "capability:use")]
    CapabilityUse,
    #[serde(rename = "review:comment")]
    ReviewComment,
    #[serde(rename = "task:finish")]
    TaskFinish,
    #[serde(rename = "dependency:edit")]
    DependencyEdit,
    #[serde(rename = "finance:read")]
    FinanceRead,
    #[serde(rename = "finance:manage")]
    FinanceManage,
    #[serde(rename = "contact:read")]
    ContactRead,
    #[serde(rename = "contact:details")]
    ContactDetails,
    #[serde(rename = "contact:manage")]
    ContactManage,
    #[serde(rename = "crm:archive")]
    CrmArchive,
    #[serde(rename = "crm:audit")]
    CrmAudit,
    #[serde(rename = "suggestion:create")]
    SuggestionCreate,
    #[serde(rename = "suggestion:decide")]
    SuggestionDecide,
    #[serde(rename = "suggestion:undo")]
    SuggestionUndo,
    #[serde(rename = "mind:write")]
    MindWrite,
    #[serde(rename = "mind:archive")]
    MindArchive,
    #[serde(rename = "audience:read")]
    AudienceRead,
    #[serde(rename = "audience:manage")]
    AudienceManage,
    #[serde(rename = "summary:read")]
    SummaryRead,
    #[serde(rename = "summary:preview")]
    SummaryPreview,
    #[serde(rename = "summary:share")]
    SummaryShare,
    #[serde(rename = "summary:revoke")]
    SummaryRevoke,
    #[serde(rename = "view:export")]
    ViewExport,
    #[serde(rename = "token:policy")]
    TokenPolicy,
    #[serde(rename = "token:grant")]
    TokenGrant,
    #[serde(rename = "token:grant_revoke")]
    TokenGrantRevoke,
}

#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Resource {
    pub workspace_id: Option<String>,
    pub user_id: Option<String>,
    pub approved_project_operation: Option<bool>,
    pub owner_id: Option<String>,
    pub oauth_grant: Option<bool>,
    pub lead_id: Option<String>,
    pub worker_id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_id")]
    pub to_worker_id: Option<Option<String>>,
    pub to: Option<TaskStatus>,
    pub task_id: Option<String>,
    pub run_id: Option<String>,
    pub agent_id: Option<String>,
    pub supervisor_id: Option<String>,
    pub member_id: Option<String>,
    pub capability: Option<Capability>,
    pub requested_review: Option<bool>,
    pub recipient_user_id: Option<String>,
}

// Missing is distinct from explicit null for task:assign in the TypeScript gate.
fn deserialize_nullable_id<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<Option<String>>, D::Error> {
    Ok(Some(serde::Deserialize::deserialize(deserializer)?))
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
    can_at(actor, action, resource, now_ms())
}

pub fn can_at(actor: Option<&Actor>, action: Action, resource: &Resource, now: i64) -> bool {
    let Some(actor) = actor else { return false };

    if action == Action::TokenPolicy {
        return actor.kind == MemberKind::Person && actor.system_admin;
    }
    if matches!(action, Action::TokenGrant | Action::TokenGrantRevoke) {
        return actor.kind == MemberKind::Person
            && (actor.system_admin
                || (resource.workspace_id.as_deref() == Some(actor.workspace_id.as_str())
                    && actor.role == Role::Admin));
    }
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
            Action::WorkspaceRead
                | Action::InboxRead
                | Action::InboxUpdate
                | Action::DigestRead
                | Action::SummaryRead
        )
    {
        return false;
    }

    if matches!(
        action,
        Action::AudienceManage
            | Action::SummaryPreview
            | Action::SummaryShare
            | Action::SummaryRevoke
    ) {
        return actor.kind == MemberKind::Person && actor.role == Role::Admin;
    }
    if action == Action::AudienceRead {
        return actor.kind == MemberKind::Person;
    }
    // Exported view images (ADR 0031): members and admins; guests stop above.
    if action == Action::ViewExport {
        return actor.kind == MemberKind::Person;
    }
    if action == Action::SummaryRead {
        return if actor.kind == MemberKind::Agent {
            has_scope(actor, Scope::SummariesRead)
        } else {
            actor.role == Role::Admin
                || (resource.recipient_user_id.is_some()
                    && actor.user_id == resource.recipient_user_id)
        };
    }
    if action == Action::ProjectManage {
        return if actor.kind == MemberKind::Person {
            actor.role == Role::Admin
        } else {
            resource.approved_project_operation == Some(true)
                && has_scope(actor, Scope::TasksWrite)
                && can_at(
                    Some(actor),
                    Action::CapabilityUse,
                    &Resource {
                        capability: Some(Capability::ProjectsManage),
                        ..resource.clone()
                    },
                    now,
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
            && can_at(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::ProjectsManage),
                    ..resource.clone()
                },
                now,
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
            && can_at(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::TasksWrite),
                    ..resource.clone()
                },
                now,
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
            && can_at(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::CrmRead),
                    ..resource.clone()
                },
                now,
            )
            && (action == Action::ContactRead
                || can_at(
                    Some(actor),
                    Action::CapabilityUse,
                    &Resource {
                        capability: Some(Capability::CrmContactDetails),
                        ..resource.clone()
                    },
                    now,
                ));
    }
    if action == Action::DependencyEdit {
        if actor.kind == MemberKind::Person {
            return actor.role == Role::Admin
                || resource.owner_id.as_deref() == Some(actor.id.as_str());
        }
        return resource.worker_id.as_deref() == Some(actor.id.as_str())
            && has_scope(actor, Scope::TasksWrite)
            && can_at(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::TasksWrite),
                    ..resource.clone()
                },
                now,
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
            && can_at(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(Capability::TasksWrite),
                    ..resource.clone()
                },
                now,
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
            if !can_at(
                Some(actor),
                Action::CapabilityUse,
                &Resource {
                    capability: Some(cap),
                    ..resource.clone()
                },
                now,
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
        if !can_at(
            Some(actor),
            Action::CapabilityUse,
            &Resource {
                capability: Some(capability),
                ..resource.clone()
            },
            now,
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
                resource.to_worker_id == Some(None)
                    || resource
                        .to_worker_id
                        .as_ref()
                        .and_then(|value| value.as_deref())
                        == Some(actor.id.as_str())
            } else {
                resource.worker_id.is_none()
                    && resource
                        .to_worker_id
                        .as_ref()
                        .and_then(|value| value.as_deref())
                        == Some(actor.id.as_str())
            };
        }
        if action == Action::TaskCreate {
            return resource
                .to_worker_id
                .as_ref()
                .and_then(|value| value.as_deref())
                .is_none_or(|value| value.is_empty() || value == actor.id);
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
            Scope::SummariesRead,
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
        Scope::SummariesRead => "summaries:read",
    }
}
