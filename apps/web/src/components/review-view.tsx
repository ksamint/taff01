"use client";

import {
  type ReviewChecks,
  type ReviewCommentInput,
  type ReviewRun,
  type ReviewWorkspace,
  reviewCommentSchema,
  reviewRunSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3, useReview } from "../lib/m3-queries";
import { useMembers } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { RunPanel } from "./run-panel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function ReviewView({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const review = useReview(taskId);
  if (review.isPending) return <p className="loading">{t("loading")}</p>;
  if (review.isError)
    return (
      <div>
        <p className="alert" role="alert">
          {t(errorKey(review.error))}
        </p>
        <Button onClick={() => void review.refetch()}>{t("retry")}</Button>
      </div>
    );
  return (
    <ReviewEditor
      key={`${review.data.run.id}:${review.data.run.status}`}
      data={review.data}
    />
  );
}

function ReviewEditor({ data }: { data: ReviewWorkspace }) {
  const { t, i18n } = useTranslation();
  const { me, workspace } = useWorkspace();
  const members = useMembers(workspace.id);
  const client = useQueryClient();
  const [checks, setChecks] = useState<ReviewChecks>(data.checks);
  const [comment, setComment] = useState("");
  const [choices, setChoices] = useState<
    Record<string, "approve" | "request_changes">
  >({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState(false);
  const review = useMutation({
    mutationFn: (body: ReviewRun) =>
      request(`/api/runs/${data.run.id}/review`, {
        method: "POST",
        body: JSON.stringify(reviewRunSchema.parse(body)),
      }),
    onSettled: () => invalidateM3(client),
  });
  const addComment = useMutation({
    mutationFn: (body: ReviewCommentInput) =>
      request(`/api/runs/${data.run.id}/comments`, {
        method: "POST",
        body: JSON.stringify(reviewCommentSchema.parse(body)),
      }),
    onSuccess: (_, body) =>
      setDrafts((current) => ({
        ...current,
        [body.artifactId ?? body.eventId ?? "overall"]: "",
      })),
    onSettled: () => invalidateM3(client),
  });
  const checkKeys: (keyof ReviewChecks)[] = [
    "matchesDescription",
    "verifiable",
    "withinPermissions",
  ];
  const busy = review.isPending || addComment.isPending;
  const eligible = data.canReview && data.run.status === "needs_review";
  const allChecked = checkKeys.every((key) => checks[key]);
  const allApproved =
    data.artifacts.length > 0 &&
    data.artifacts.every((artifact) => choices[artifact.id] === "approve");
  const hasChangeComment =
    comment.trim() ||
    data.artifacts.some(
      (artifact) =>
        choices[artifact.id] === "request_changes" &&
        drafts[artifact.id]?.trim(),
    );
  const when = (date: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage ?? me.user.locale, {
      timeZone: me.user.tz,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(date));
  function decide(decision: ReviewRun["decision"]) {
    const parsed = reviewRunSchema.safeParse({
      version: data.run.version,
      decision,
      checks,
      comment,
      items: data.artifacts
        .filter((artifact) => choices[artifact.id])
        .map((artifact) => ({
          artifactId: artifact.id,
          decision: choices[artifact.id],
          comment: drafts[artifact.id] ?? "",
        })),
    });
    setValidationError(!parsed.success);
    if (parsed.success) review.mutate(parsed.data);
  }
  function submitComment(
    event: FormEvent<HTMLFormElement>,
    item: { artifactId?: string; eventId?: string },
    key: string,
  ) {
    event.preventDefault();
    const parsed = reviewCommentSchema.safeParse({
      version: data.run.version,
      body: drafts[key] ?? "",
      ...item,
    });
    setValidationError(!parsed.success);
    if (parsed.success) addComment.mutate(parsed.data);
  }
  function commentsFor(
    artifactId: string | null,
    eventId: string | null = null,
  ) {
    return (
      <ul className="review-comments">
        {data.comments
          .filter(
            (entry) =>
              entry.artifactId === artifactId && entry.eventId === eventId,
          )
          .map((entry) => (
            <li key={entry.id}>
              <strong>
                {members.data?.find((member) => member.id === entry.authorId)
                  ?.name ?? t("unknownMember")}
              </strong>
              <time dateTime={entry.createdAt}>{when(entry.createdAt)}</time>
              <p className="preserve-text">{entry.body}</p>
            </li>
          ))}
      </ul>
    );
  }
  return (
    <>
      <Link className="back-link" href={`/tasks/${data.task.id}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t("review.back")}
      </Link>
      <section className="page-heading">
        <p className="eyebrow">{t("review.title")}</p>
        <h1>{data.task.title}</h1>
        <span
          className={`status status-${data.task.status}`}
          data-testid="review-task-status"
        >
          {t(`status.${data.task.status}`)}
        </span>
      </section>
      <div className="review-layout">
        <div className="deliverables">
          <h2>{t("review.deliverables")}</h2>
          {data.artifacts.length === 0 && (
            <p className="section-hint">{t("review.noArtifacts")}</p>
          )}
          {data.artifacts.map((artifact) => (
            <article
              className="deliverable"
              data-testid="review-artifact"
              key={artifact.id}
            >
              <div className="deliverable-heading">
                <FileText size={16} aria-hidden="true" />
                <h3>{artifact.name}</h3>
                <span>{artifact.mimeType}</span>
              </div>
              <div className="deliverable-body">
                <h4 className="section-label">{t("review.preview")}</h4>
                <pre
                  className="artifact-preview"
                  data-testid="artifact-preview"
                >
                  {artifact.content}
                </pre>
                {artifact.diff && (
                  <>
                    <h4 className="section-label">{t("review.diff")}</h4>
                    <pre className="artifact-diff" data-testid="artifact-diff">
                      {artifact.diff}
                    </pre>
                  </>
                )}
                {artifact.sourceUrl && (
                  <p>
                    <a
                      className="text-link"
                      href={artifact.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("review.source")}: {artifact.sourceUrl}
                    </a>
                  </p>
                )}
                {eligible && (
                  <>
                    <div
                      className="segmented"
                      role="group"
                      aria-label={t("review.itemDecision", {
                        name: artifact.name,
                      })}
                    >
                      <Button
                        data-testid="item-approve"
                        disabled={busy}
                        aria-pressed={choices[artifact.id] === "approve"}
                        onClick={() =>
                          setChoices((current) => ({
                            ...current,
                            [artifact.id]: "approve",
                          }))
                        }
                      >
                        {t("review.approveItem")}
                      </Button>
                      <Button
                        data-testid="item-changes"
                        disabled={busy}
                        aria-pressed={
                          choices[artifact.id] === "request_changes"
                        }
                        onClick={() =>
                          setChoices((current) => ({
                            ...current,
                            [artifact.id]: "request_changes",
                          }))
                        }
                      >
                        {t("review.changesItem")}
                      </Button>
                    </div>
                    <form
                      className="item-comment"
                      onSubmit={(event) =>
                        submitComment(
                          event,
                          { artifactId: artifact.id },
                          artifact.id,
                        )
                      }
                    >
                      <Label htmlFor={`comment-${artifact.id}`}>
                        {t("review.itemComment")}
                      </Label>
                      <Input
                        id={`comment-${artifact.id}`}
                        data-testid="item-comment"
                        value={drafts[artifact.id] ?? ""}
                        maxLength={5000}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [artifact.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        data-testid="item-comment-submit"
                        type="submit"
                        disabled={busy || !drafts[artifact.id]?.trim()}
                      >
                        {t("review.addComment")}
                      </Button>
                    </form>
                  </>
                )}
                {commentsFor(artifact.id)}
              </div>
            </article>
          ))}
          <section className="review-evidence">
            <h2>{t("review.sourcesTests")}</h2>
            {data.events.filter(
              (event) => event.kind === "source" || event.kind === "test",
            ).length === 0 ? (
              <p className="section-hint">{t("review.noEvidence")}</p>
            ) : (
              <ul className="evidence-list">
                {data.events
                  .filter(
                    (event) => event.kind === "source" || event.kind === "test",
                  )
                  .map((event) => (
                    <li key={event.id}>
                      <strong>{event.title}</strong>
                      {event.testStatus && (
                        <span className={`test-${event.testStatus}`}>
                          {t(`review.testStatus.${event.testStatus}`)}
                        </span>
                      )}
                      {event.text && (
                        <p className="preserve-text">{event.text}</p>
                      )}
                      {event.sourceUrl && (
                        <a
                          className="text-link"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={event.sourceUrl}
                        >
                          {event.sourceUrl}
                        </a>
                      )}
                      {commentsFor(null, event.id)}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="review-sidebar">
          <RunPanel detail={data} refresh={() => void invalidateM3(client)} />
          <section className="review-checklist">
            <h2>{t("review.checklist")}</h2>
            <p className="section-hint">
              {t("review.checked", {
                count: checkKeys.filter((key) => checks[key]).length,
              })}
            </p>
            {checkKeys.map((key) => (
              <label key={key} className="check-row">
                <input
                  type="checkbox"
                  data-testid={`review-check-${key}`}
                  checked={checks[key]}
                  disabled={!eligible || busy}
                  onChange={(event) =>
                    setChecks((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                />
                {t(`review.check.${key}`)}
              </label>
            ))}
            {eligible && (
              <>
                <div className="field">
                  <Label htmlFor="review-comment">
                    {t("review.overallComment")}
                  </Label>
                  <textarea
                    id="review-comment"
                    data-testid="review-comment"
                    className="input"
                    value={comment}
                    maxLength={5000}
                    rows={4}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </div>
                <div className="action-row">
                  <Button
                    data-testid="review-approve"
                    className="button-primary"
                    disabled={busy || !allChecked || !allApproved}
                    onClick={() => decide("approve")}
                  >
                    <Check size={16} aria-hidden="true" />
                    {t("review.approve")}
                  </Button>
                  <Button
                    data-testid="review-request-changes"
                    disabled={busy || !hasChangeComment}
                    onClick={() => decide("request_changes")}
                  >
                    {t("review.requestChanges")}
                  </Button>
                </div>
                <p className="section-hint">{t("review.approveHint")}</p>
              </>
            )}
            {(validationError || review.isError || addComment.isError) && (
              <p className="alert" role="alert">
                {t(
                  validationError
                    ? "errors.invalid_input"
                    : errorKey(review.error ?? addComment.error),
                )}
              </p>
            )}
            {!eligible && (
              <p className="section-hint" data-testid="review-readonly">
                {t(
                  data.run.status === "completed"
                    ? "review.approved"
                    : "review.readonly",
                )}
              </p>
            )}
          </section>
          <section className="review-evidence">
            <h2>{t("review.comments")}</h2>
            {commentsFor(null)}
          </section>
        </aside>
      </div>
    </>
  );
}
