"use client";
import {
  type SearchInput,
  searchInputSchema,
  searchResultSchema,
} from "@taff/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SheetDialog } from "./ui/sheet-dialog";

const SETTINGS = [
  { key: "organization.title", href: "/orgs" },
  { key: "organization.team", href: "/orgs#team" },
  { key: "language", href: "/me#me-locale" },
  { key: "me.appearance", href: "/me#preferences-heading" },
  { key: "mcp.title", href: "/me/mcp" },
];
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { workspace, me, setWorkspaceId } = useWorkspace();
  const { t } = useTranslation();
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
    <SheetDialog title={t("search.title")} onClose={onClose}>
      <div
        onKeyDown={(event) => {
          if (!(event.target instanceof HTMLInputElement)) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((current) =>
              count
                ? (current + (event.key === "ArrowDown" ? 1 : -1) + count) %
                  count
                : 0,
            );
          } else if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            count
          ) {
            event.preventDefault();
            buttons.current[Math.min(index, count - 1)]?.click();
          }
        }}
      >
        <Input
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
        <div
          className="project-tabs"
          role="group"
          aria-label={t("organization.title")}
        >
          {(["workspace", "all"] as const).map((value) => (
            <Button
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
          className="project-tabs"
          role="group"
          aria-label={t("search.title")}
        >
          {(["all", "task", "comment", "settings"] as const).map((value) => (
            <Button
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
        {!deferred ? (
          <>
            <h3 className="section-label">{t("search.recent")}</h3>
            <div className="project-tabs">
              {recent.map((value) => (
                <Button key={value} onClick={() => setQuery(value)}>
                  {value}
                </Button>
              ))}
            </div>
            <h3 className="section-label">{t("search.quickFilters")}</h3>
            <div className="project-tabs">
              {[
                { token: "is:review", key: "status.needs_review" },
                { token: "is:mine", key: "projects.mine" },
                { token: "is:today", key: "today" },
                { token: "is:agent", key: "projects.agents" },
              ].map((item) => (
                <Button key={item.token} onClick={() => setQuery(item.token)}>
                  {t(item.key)} <code>{item.token}</code>
                </Button>
              ))}
            </div>
            <p className="section-hint">{t("search.hint")}</p>
          </>
        ) : (
          <>
            {results.isFetching && type !== "settings" && (
              <p className="section-hint" role="status">
                {t("loading")}
              </p>
            )}
            {results.isError && type !== "settings" && (
              <p role="alert" className="alert">
                {t(errorKey(results.error))}
              </p>
            )}
            <div
              id={listId}
              className="search-results"
              role="listbox"
              aria-label={t("search.title")}
            >
              {hits.map((hit, row) => (
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
                  className="search-result"
                  onMouseEnter={() => setIndex(row)}
                  onClick={() => {
                    remember();
                    setWorkspaceId(hit.workspaceId);
                    router.push(`/tasks/${hit.taskId}`);
                    onClose();
                  }}
                >
                  <strong>{hit.title}</strong>
                  <small>
                    {hit.workspaceName} · {t(`status.${hit.task.status}`)}
                    {hit.match !== "title"
                      ? ` · ${t(hit.match === "comment" ? "search.matchingComment" : "search.matchingDescription")}`
                      : ""}
                  </small>
                  {hit.snippet && (
                    <span className="preserve-text">{hit.snippet}</span>
                  )}
                </button>
              ))}
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
                    className="search-result"
                    onMouseEnter={() => setIndex(row)}
                    onClick={() => {
                      remember();
                      router.push(item.href);
                      onClose();
                    }}
                  >
                    <strong>{t(item.key)}</strong>
                    <small>{t("search.settings")}</small>
                  </button>
                );
              })}
            </div>
            {!results.isFetching && !count && !results.isError && (
              <p className="section-hint">{t("search.empty")}</p>
            )}
          </>
        )}
        <p className="section-hint">{t("search.keyboard")}</p>
      </div>
    </SheetDialog>
  );
}
