"use client";

import {
  type Member,
  type Project,
  projectHealth,
  projectHealthUpdateInputSchema,
  projectHealthUpdateListSchema,
  projectHealthUpdateSchema,
} from "@taff/schemas";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useWorkspace } from "./app-shell";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

type Health = (typeof projectHealth)[number];
const updatesKey = (projectId: string) =>
  ["project-updates", projectId] as const;

function HealthChip({ health }: { health: Health }) {
  const { t } = useTranslation();
  return (
    <Badge className={`project-health-chip is-${health}`}>
      {t(`projectUpdates.health.${health}`)}
    </Badge>
  );
}

export function ProjectHealthUpdates({
  project,
  members,
}: {
  project: Project;
  members: Member[];
}) {
  const { confirmed, me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const [panel, setPanel] = useState<"history" | "post" | null>(null);
  const canPost =
    confirmed &&
    project.workspaceId === workspace.id &&
    (workspace.role === "admin" || project.leadId === workspace.memberId);
  const updates = useInfiniteQuery({
    queryKey: updatesKey(project.id),
    enabled: confirmed,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const query = new URLSearchParams({ projectId: project.id });
      if (pageParam) query.set("before", pageParam);
      return projectHealthUpdateListSchema.parse(
        await request(`/api/project-updates?${query}`, {
          cache: "no-store",
          signal,
        }),
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: false,
  });
  const pages = updates.isSuccess ? updates.data.pages : [];
  const latest = pages[0]?.updates[0];
  const postedAt = new Intl.DateTimeFormat(
    i18n.resolvedLanguage ?? me.user.locale,
    { dateStyle: "medium", timeStyle: "short", timeZone: me.user.tz },
  );
  if (!confirmed) return null;
  return (
    <>
      <div className="project-health-controls">
        {latest && <HealthChip health={latest.health} />}
        <Button
          type="button"
          className="timeline-toggle"
          onClick={() => setPanel("history")}
        >
          {t("projectUpdates.title")}
        </Button>
      </div>
      {panel === "post" && canPost ? (
        <PostProjectUpdate
          projectId={project.id}
          initialHealth={latest?.health ?? "on_track"}
          onClose={() => setPanel("history")}
        />
      ) : panel ? (
        <SheetDialog
          title={t("projectUpdates.title")}
          onClose={() => setPanel(null)}
        >
          {canPost && (
            <Button type="button" onClick={() => setPanel("post")}>
              {t("projectUpdates.post")}
            </Button>
          )}
          {updates.isPending && <p>{t("loading")}</p>}
          {updates.isError && (
            <p role="alert" className="alert">
              {t(errorKey(updates.error))}
            </p>
          )}
          {updates.isSuccess && !latest && <p>{t("projectUpdates.empty")}</p>}
          {latest && (
            <ol className="project-health-history">
              {pages.flatMap((page) =>
                page.updates.map((update) => {
                  const author = members.find(
                    (member) => member.id === update.authorId,
                  )?.name;
                  return (
                    <li key={update.id}>
                      <header>
                        <HealthChip health={update.health} />
                        {author && <span>{author}</span>}
                        <time dateTime={update.createdAt}>
                          {postedAt.format(new Date(update.createdAt))}
                        </time>
                      </header>
                      {update.body && (
                        <p className="preserve-text">{update.body}</p>
                      )}
                    </li>
                  );
                }),
              )}
            </ol>
          )}
          {updates.hasNextPage && (
            <Button
              type="button"
              disabled={updates.isFetching}
              onClick={() => void updates.fetchNextPage()}
            >
              {t("projectUpdates.older")}
            </Button>
          )}
        </SheetDialog>
      ) : null}
    </>
  );
}

function PostProjectUpdate({
  projectId,
  initialHealth,
  onClose,
}: {
  projectId: string;
  initialHealth: Health;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const healthId = useId();
  const bodyId = useId();
  const [health, setHealth] = useState<Health>(initialHealth);
  const [body, setBody] = useState("");
  const input = projectHealthUpdateInputSchema.safeParse({
    projectId,
    health,
    body,
  });
  const post = useMutation({
    mutationFn: async (value: NonNullable<typeof input.data>) =>
      projectHealthUpdateSchema.parse(
        await request("/api/project-updates", {
          method: "POST",
          body: JSON.stringify(value),
        }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: updatesKey(projectId) });
      onClose();
    },
  });
  return (
    <SheetDialog title={t("projectUpdates.post")} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.success && !post.isPending) post.mutate(input.data);
        }}
      >
        <div className="field">
          <Label htmlFor={healthId}>{t("projectUpdates.healthLabel")}</Label>
          <select
            id={healthId}
            value={health}
            onChange={(event) =>
              setHealth(
                projectHealth.find((value) => value === event.target.value) ??
                  health,
              )
            }
          >
            {projectHealth.map((value) => (
              <option key={value} value={value}>
                {t(`projectUpdates.health.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Label htmlFor={bodyId}>{t("projectUpdates.notes")}</Label>
          <textarea
            id={bodyId}
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          {!input.success && (
            <p role="alert" className="alert">
              {t("projectUpdates.bodyLimit", { max: 2000 })}
            </p>
          )}
        </div>
        {post.isError && (
          <p role="alert" className="alert">
            {t(errorKey(post.error))}
          </p>
        )}
        <div className="action-row">
          <Button type="button" onClick={onClose}>
            {t("planning.cancel")}
          </Button>
          <Button
            type="submit"
            className="button-primary"
            disabled={!input.success || post.isPending}
          >
            {t(post.isPending ? "working" : "projectUpdates.post")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}
