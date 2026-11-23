use crate::{Db, MutationActor, write::database_error};
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::PgConnection;
use taff_contract::{
    MAX_RATE_MICROS_PER_HOUR, MemberRate, MemberRateInput, TimeEntries, TimeEntry, TimeEntryEdit,
    TimeEntryInput,
};
use taff_domain::{Action, Actor, CoreError, Resource, Result, Role, Zone, can};
use uuid::Uuid;

pub struct PersonalRecordsScope {
    pub workspace_id: Uuid,
    pub person_id: Option<Uuid>,
    pub all: bool,
}

struct WorkspacePerson {
    id: Uuid,
    time_zone: String,
    actor: Actor,
    resource: Resource,
}

impl WorkspacePerson {
    fn require(&self, action: Action) -> Result<()> {
        if can(Some(&self.actor), action, &self.resource) {
            Ok(())
        } else {
            Err(CoreError::Forbidden)
        }
    }

    fn resolve_filter(&self, scope: &PersonalRecordsScope) -> Result<Option<Uuid>> {
        if scope.all && scope.person_id.is_some() {
            return Err(CoreError::InvalidInput);
        }
        if scope.all || scope.person_id.is_some_and(|id| id != self.id) {
            self.require(Action::WorkspaceManage)?;
        }
        Ok(if scope.all {
            None
        } else {
            Some(scope.person_id.unwrap_or(self.id))
        })
    }
}

async fn workspace_person(
    db: &mut PgConnection,
    user_id: &str,
    workspace_id: Uuid,
) -> Result<WorkspacePerson> {
    let row = sqlx::query!(
        r#"SELECT members.id, members.role::text AS "role!", workspaces.time_zone
           FROM members JOIN workspaces ON workspaces.id = members.workspace_id
           WHERE members.workspace_id = $1 AND members.user_id = $2
             AND members.kind = 'person' AND workspaces.archived_at IS NULL
           FOR SHARE OF members, workspaces"#,
        workspace_id,
        user_id,
    )
    .fetch_optional(db)
    .await
    .map_err(database_error)?
    .ok_or(CoreError::NotFound)?;
    let role = match row.role.as_str() {
        "admin" => Role::Admin,
        "member" => Role::Member,
        "guest" => Role::Guest,
        _ => return Err(CoreError::Forbidden),
    };
    let person = WorkspacePerson {
        id: row.id,
        time_zone: row.time_zone,
        actor: Actor {
            id: row.id.to_string(),
            workspace_id: workspace_id.to_string(),
            user_id: Some(user_id.to_owned()),
            role,
            ..Actor::default()
        },
        resource: Resource {
            workspace_id: Some(workspace_id.to_string()),
            ..Resource::default()
        },
    };
    person.require(Action::WorkspaceRead)?;
    Ok(person)
}

async fn own_entry_scope(db: &mut PgConnection, user_id: &str, id: Uuid) -> Result<(Uuid, Uuid)> {
    let row = sqlx::query!(
        "SELECT workspace_id, person_id FROM time_entries WHERE id = $1",
        id
    )
    .fetch_optional(&mut *db)
    .await
    .map_err(database_error)?
    .ok_or(CoreError::NotFound)?;
    let person = workspace_person(db, user_id, row.workspace_id).await?;
    if person.id != row.person_id {
        return Err(CoreError::Forbidden);
    }
    Ok((row.workspace_id, person.id))
}

fn workspace_day(time_zone: &str, now: DateTime<Utc>) -> Result<NaiveDate> {
    let zone: Zone = time_zone
        .parse()
        .map_err(|_| CoreError::Other(anyhow::anyhow!("invalid workspace time zone")))?;
    let civil = zone.civil(&now);
    NaiveDate::from_ymd_opt(civil.year, civil.month, civil.day)
        .ok_or_else(|| CoreError::Other(anyhow::anyhow!("invalid workspace civil date")))
}

fn validate_entry(minutes: i32, note: &str) -> Result<()> {
    if !(1..=1440).contains(&minutes) || note.chars().count() > 2000 || note.contains('\0') {
        return Err(CoreError::InvalidInput);
    }
    Ok(())
}

impl Db {
    pub async fn time_entries(
        &self,
        user_id: &str,
        scope: PersonalRecordsScope,
        task_id: Option<Uuid>,
    ) -> Result<TimeEntries> {
        let mut tx = self.pool.begin().await.map_err(database_error)?;
        let person = workspace_person(&mut tx, user_id, scope.workspace_id).await?;
        let person_id = person.resolve_filter(&scope)?;
        let entries = sqlx::query_as!(
            TimeEntry,
            "SELECT id, workspace_id, task_id, person_id, minutes, day, note, created_at
             FROM time_entries
             WHERE workspace_id = $1 AND ($2::uuid IS NULL OR person_id = $2)
               AND ($3::uuid IS NULL OR task_id = $3)
             ORDER BY day DESC, created_at DESC, id DESC",
            scope.workspace_id,
            person_id,
            task_id,
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(database_error)?;
        let today = workspace_day(&person.time_zone, Utc::now())?;
        tx.commit().await.map_err(database_error)?;
        Ok(TimeEntries {
            time_zone: person.time_zone,
            today,
            entries,
        })
    }

    pub async fn create_time_entry(
        &self,
        user_id: &str,
        input: TimeEntryInput,
    ) -> Result<TimeEntry> {
        validate_entry(input.minutes, &input.note)?;
        self.mutate(MutationActor::Person(user_id), async move |tx| {
            let workspace_id = sqlx::query_scalar!(
                "SELECT workspace_id FROM tasks WHERE id = $1 AND archived_at IS NULL FOR SHARE",
                input.task_id,
            )
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(CoreError::NotFound)?;
            let person = workspace_person(tx, user_id, workspace_id).await?;
            let entry = sqlx::query_as!(
                TimeEntry,
                "INSERT INTO time_entries (workspace_id, task_id, person_id, minutes, day, note)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, workspace_id, task_id, person_id, minutes, day, note, created_at",
                workspace_id,
                input.task_id,
                person.id,
                input.minutes,
                input.day,
                input.note,
            )
            .fetch_one(tx)
            .await?;
            Ok(entry)
        })
        .await
    }

    pub async fn edit_time_entry(
        &self,
        user_id: &str,
        id: Uuid,
        input: TimeEntryEdit,
    ) -> Result<TimeEntry> {
        validate_entry(input.minutes, &input.note)?;
        self.mutate(MutationActor::Person(user_id), async move |tx| {
            let (workspace_id, person_id) = own_entry_scope(tx, user_id, id).await?;
            let entry = sqlx::query_as!(
                TimeEntry,
                "UPDATE time_entries SET minutes = $4, day = $5, note = $6
                 WHERE id = $1 AND workspace_id = $2 AND person_id = $3
                 RETURNING id, workspace_id, task_id, person_id, minutes, day, note, created_at",
                id,
                workspace_id,
                person_id,
                input.minutes,
                input.day,
                input.note,
            )
            .fetch_optional(tx)
            .await?
            .ok_or(CoreError::NotFound)?;
            Ok(entry)
        })
        .await
    }

    pub async fn delete_time_entry(&self, user_id: &str, id: Uuid) -> Result<()> {
        self.mutate(MutationActor::Person(user_id), async move |tx| {
            let (workspace_id, person_id) = own_entry_scope(tx, user_id, id).await?;
            sqlx::query!(
                "DELETE FROM time_entries WHERE id = $1 AND workspace_id = $2 AND person_id = $3 RETURNING id",
                id,
                workspace_id,
                person_id,
            )
            .fetch_optional(tx)
            .await?
            .ok_or(CoreError::NotFound)?;
            Ok(())
        })
        .await
    }

    pub async fn member_rates(
        &self,
        user_id: &str,
        scope: PersonalRecordsScope,
    ) -> Result<Vec<MemberRate>> {
        let mut tx = self.pool.begin().await.map_err(database_error)?;
        let person = workspace_person(&mut tx, user_id, scope.workspace_id).await?;
        let person_id = person.resolve_filter(&scope)?;
        let rates = sqlx::query_as!(
            MemberRate,
            "SELECT workspace_id, person_id, rate_micros_per_hour, currency, valid_from
             FROM member_rates
             WHERE workspace_id = $1 AND ($2::uuid IS NULL OR person_id = $2)
             ORDER BY valid_from DESC, person_id",
            scope.workspace_id,
            person_id,
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(database_error)?;
        tx.commit().await.map_err(database_error)?;
        Ok(rates)
    }

    pub async fn upsert_member_rate(
        &self,
        user_id: &str,
        input: MemberRateInput,
    ) -> Result<MemberRate> {
        if !(0..=MAX_RATE_MICROS_PER_HOUR).contains(&input.rate_micros_per_hour)
            || input.currency.len() != 3
            || !input.currency.bytes().all(|byte| byte.is_ascii_uppercase())
        {
            return Err(CoreError::InvalidInput);
        }
        self.mutate(MutationActor::Person(user_id), async move |tx| {
            workspace_person(tx, user_id, input.workspace_id)
                .await?
                .require(Action::WorkspaceManage)?;
            sqlx::query_scalar!(
                "SELECT id FROM members WHERE id = $1 AND workspace_id = $2 AND kind = 'person' FOR SHARE",
                input.person_id,
                input.workspace_id,
            )
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(CoreError::NotFound)?;
            let rate = sqlx::query_as!(
                MemberRate,
                "INSERT INTO member_rates (workspace_id, person_id, rate_micros_per_hour, currency, valid_from)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (workspace_id, person_id, valid_from) DO UPDATE
                   SET rate_micros_per_hour = EXCLUDED.rate_micros_per_hour, currency = EXCLUDED.currency
                 RETURNING workspace_id, person_id, rate_micros_per_hour, currency, valid_from",
                input.workspace_id,
                input.person_id,
                input.rate_micros_per_hour,
                input.currency,
                input.valid_from,
            )
            .fetch_one(tx)
            .await?;
            Ok(rate)
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_day_follows_local_midnight() {
        let now = "2026-11-22T18:30:00Z".parse().unwrap();
        assert_eq!(
            workspace_day("Asia/Singapore", now).unwrap().to_string(),
            "2026-11-23"
        );
        assert_eq!(
            workspace_day("America/Los_Angeles", now)
                .unwrap()
                .to_string(),
            "2026-11-22"
        );
    }
}
