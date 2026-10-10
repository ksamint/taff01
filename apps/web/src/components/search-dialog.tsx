"use client";
import {
  type SearchInput,
  searchInputSchema,
  searchResultSchema,
} from "@taff/schemas";
import {
  type PrototypeLocale,
  presentPrototypeField,
  prototypeTaskReference,
} from "@taff/schemas/prototype-data";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MessageSquare, Search, Settings, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SheetDialog } from "./ui/sheet-dialog";
import { StatusGlyph } from "./ui/status-glyph";

const SETTINGS = [
  { key: "organization.title", href: "/orgs" },
  { key: "organization.team", href: "/orgs#team" },
  { key: "language", href: "/me#me-locale" },
  { key: "me.appearance", href: "/me#preferences-heading" },
  { key: "notifications.title", href: "/me/notifications" },
  { key: "mcp.title", href: "/me/mcp" },
];
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { workspace, me, setWorkspaceId } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage as PrototypeLocale;
  const router = useRouter();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const [scope, setScope] = useState<SearchInput["scope"]>("workspace");
  const [type, setType] = useState<"all" | "task" | "comment" | "settings">(
    "all",
  );
  const [index, setIndex] = useState(0);
  const listId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const recentKey = ["search-recent", me.user.id];
  const recent = client.getQueryData<string[]>(recentKey) ?? [];
  const results = useQuery({
    queryKey: ["search", workspace.id, scope, type, deferred],
    enabled: !!deferred && type !== "settings",
    queryFn: async () =>
      (
        await request<unknown[]>(`/api/search?workspaceId=${workspace.id}`, {
          method: "POST",
          body: JSON.stringify(
            searchInputSchema.parse({
              query: deferred,
              scope,
              ...(type === "all" ? {} : { types: [type] }),
            }),
          ),
        })
      ).map((value) => searchResultSchema.parse(value)),
    retry: false,
  });
  const settings =
    ["all", "settings"].includes(type) && deferred
      ? SETTINGS.filter((item) =>
          t(item.key)
            .toLocaleLowerCase()
            .includes(deferred.toLocaleLowerCase()),
        )
      : [];
  const hits = type === "settings" ? [] : (results.data ?? []);
  const taskHits = hits.filter((hit) => hit.type === "task");
  const commentHits = hits.filter((hit) => hit.type === "comment");
  const groups = [
    { type: "task", label: "search.tasks", items: taskHits, offset: 0 },
    {
      type: "comment",
      label: "search.comments",
      items: commentHits,
      offset: taskHits.length,
    },
  ];
  const count = hits.length + settings.length;
  useEffect(() => setIndex(0), [deferred, scope, type]);
  useEffect(() => {
    buttons.current[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const remember = () =>
    client.setQueryData(
      recentKey,
      [query.trim(), ...recent.filter((item) => item !== query.trim())].slice(
        0,
        5,
      ),
    );
  return (
    <SheetDialog
      title={t("search.title")}
      onClose={onClose}
      className="search-parity-dialog"
    >
      <div
        className="search-parity-content"
        onKeyDown={(event) => {
          if (
            !(event.target instanceof HTMLInputElement) ||
            event.nativeEvent.isComposing
          )
            return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((current) =>
              count
                ? (current + (event.key === "ArrowDown" ? 1 : -1) + count) %
                  count
                : 0,
            );
          } else if (event.key === "Enter" && count) {
            event.preventDefault();
            buttons.current[Math.min(index, count - 1)]?.click();
          }
        }}
      >
        <div className="search-parity-header">
          <div className="search-parity-field">
            <Search size={18} strokeWidth={1.5} aria-hidden="true" />
            <Input
              id={`${listId}-input`}
              data-testid="search-input"
              autoFocus
              aria-label={t("search.placeholder")}
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={200}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={!!deferred}
              aria-controls={listId}
              aria-activedescendant={
                count ? `${listId}-${Math.min(index, count - 1)}` : undefined
              }
            />
            {!!query && (
              <Button
                type="button"
                className="search-parity-clear"
                aria-label={t("search.clear")}
                onClick={() => {
                  setQuery("");
                  document.getElementById(`${listId}-input`)?.focus();
                }}
              >
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            )}
          </div>
          <Button
            type="button"
            className="search-parity-cancel"
            onClick={onClose}
          >
            {t("search.cancel")}
          </Button>
        </div>
        <div
          className="search-parity-scope"
          role="group"
          aria-label={t("organization.title")}
        >
          {(["workspace", "all"] as const).map((value) => (
            <Button
              type="button"
              key={value}
              data-testid={`search-scope-${value}`}
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {t(value === "workspace" ? "search.thisOrg" : "search.allOrgs")}
            </Button>
          ))}
        </div>
        <div
          className="search-parity-types"
          role="group"
          aria-label={t("search.title")}
        >
          {(["all", "task", "comment", "settings"] as const).map((value) => (
            <Button
              type="button"
              key={value}
              data-testid={`search-type-${value}`}
              aria-pressed={type === value}
              onClick={() => setType(value)}
            >
              {t(
                `search.${value === "task" ? "tasks" : value === "comment" ? "comments" : value}`,
              )}
            </Button>
          ))}
        </div>
        <div className="search-parity-scroll">
          {!deferred ? (
            <div className="search-parity-empty-query">
              {!!recent.length && (
                <section className="search-parity-recent">
                  <h3>{t("search.recent")}</h3>
                  {recent.map((value) => (
                    <Button
                      type="button"
                      key={value}
                      onClick={() => setQuery(value)}
                    >
                      <Clock size={14} strokeWidth={1.5} aria-hidden="true" />
                      {value}
                    </Button>
                  ))}
                </section>
              )}
              <section className="search-parity-quick">
                <h3>{t("search.quickFilters")}</h3>
                <div>
                  {[
                    { token: "is:review", key: "status.needs_review" },
                    { token: "is:mine", key: "projects.mine" },
                    { token: "is:today", key: "today" },
                    { token: "is:agent", key: "projects.agents" },
                  ].map((item) => (
                    <Button
                      type="button"
                      key={item.token}
                      onClick={() => setQuery(item.token)}
                    >
                      {t(item.key)} <code>{item.token}</code>
                    </Button>
                  ))}
                </div>
                <p>{t("search.hint")}</p>
              </section>
            </div>
          ) : (
            <>
              {results.isFetching && type !== "settings" && (
                <p className="search-parity-message" role="status">
                  {t("loading")}
                </p>
              )}
              {results.isError && type !== "settings" && (
                <p role="alert" className="alert search-parity-message">
                  {t(errorKey(results.error))}
                </p>
              )}
              <div
                id={listId}
                className="search-parity-results"
                role="listbox"
                aria-label={t("search.title")}
              >
                {groups
                  .filter((group) => group.items.length)
                  .map((group) => (
                    <div
                      key={group.type}
                      role="group"
                      aria-label={t(group.label)}
                    >
                      <div
                        className="search-parity-group-heading"
                        aria-hidden="true"
                      >
                        <span>{t(group.label)}</span>
                        <span>{group.items.length}</span>
                      </div>
                      {group.items.map((hit, offset) => {
                        const row = group.offset + offset;
                        const title = presentPrototypeField(
                          hit.taskId,
                          "title",
                          hit.title,
                          locale,
                        );
                        return (
                          <button
                            key={`${hit.type}:${hit.id}`}
                            type="button"
                            role="option"
                            aria-selected={index === row}
                            id={`${listId}-${row}`}
                            ref={(node) => {
                              buttons.current[row] = node;
                            }}
                            data-testid="search-result"
                            tabIndex={-1}
                            className="search-parity-result"
                            onMouseEnter={() => setIndex(row)}
                            onClick={() => {
                              remember();
                              setWorkspaceId(hit.workspaceId);
                              router.push(`/tasks/${hit.taskId}`);
                              onClose();
                            }}
                          >
                            <span
                              className="search-parity-result-icon"
                              aria-hidden="true"
                            >
                              {hit.type === "task" ? (
                                <StatusGlyph status={hit.task.status} />
                              ) : (
                                <MessageSquare size={16} strokeWidth={1.5} />
                              )}
                            </span>
                            <span className="search-parity-result-copy">
                              <span className="search-parity-result-title">
                                <span className="search-parity-reference">
                                  {prototypeTaskReference(hit.taskId) ??
                                    hit.taskId.slice(0, 8)}
                                </span>
                                <SearchMatch text={title} query={deferred} />
                              </span>
                              {!!hit.snippet && (
                                <span className="search-parity-snippet preserve-text">
                                  <SearchMatch
                                    text={hit.snippet}
                                    query={deferred}
                                  />
                                </span>
                              )}
                              <span className="search-parity-result-meta">
                                <span>
                                  {t(`status.${hit.task.status}`)}
                                  {hit.match !== "title"
                                    ? ` · ${t(hit.match === "comment" ? "search.matchingComment" : "search.matchingDescription")}`
                                    : ""}
                                </span>
                                <span className="search-parity-org">
                                  {presentPrototypeField(
                                    hit.workspaceId,
                                    "name",
                                    hit.workspaceName,
                                    locale,
                                  )}
                                </span>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                {!!settings.length && (
                  <div role="group" aria-label={t("search.settings")}>
                    <div
                      className="search-parity-group-heading"
                      aria-hidden="true"
                    >
                      <span>{t("search.settings")}</span>
                      <span>{settings.length}</span>
                    </div>
                    {settings.map((item, offset) => {
                      const row = hits.length + offset;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="option"
                          aria-selected={index === row}
                          id={`${listId}-${row}`}
                          ref={(node) => {
                            buttons.current[row] = node;
                          }}
                          tabIndex={-1}
                          data-testid="search-setting"
                          className="search-parity-result"
                          onMouseEnter={() => setIndex(row)}
                          onClick={() => {
                            remember();
                            router.push(item.href);
                            onClose();
                          }}
                        >
                          <span
                            className="search-parity-result-icon"
                            aria-hidden="true"
                          >
                            <Settings size={16} strokeWidth={1.5} />
                          </span>
                          <span className="search-parity-result-copy">
                            <span className="search-parity-result-title">
                              <SearchMatch
                                text={t(item.key)}
                                query={deferred}
                              />
                            </span>
                            <span className="search-parity-result-meta">
                              {t("search.settings")}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {!results.isFetching && !count && !results.isError && (
                <div className="search-parity-no-results">
                  <span aria-hidden="true">
                    <Search size={20} strokeWidth={1.5} />
                  </span>
                  <p>{t("search.empty")}</p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="search-parity-footer">
          <span>{t("search.keyboard")}</span>
          <kbd>⌘K</kbd>
        </div>
      </div>
    </SheetDialog>
  );
}

/** Render API text as escaped React text, highlighting only the literal query. */
function SearchMatch({ text, query }: { text: string; query: string }) {
  const start = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (!query || start < 0) return text;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, start + query.length)}</mark>
      {text.slice(start + query.length)}
    </>
  );
}
