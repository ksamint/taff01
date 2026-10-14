// Shell (session) mutations. app-shell is in the Today initial bundle, so this
// file only imports what app-shell imported before the M13 extraction.
import type { Locale, Me } from "@taff/schemas";
import { profileSchema } from "@taff/schemas/base";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { i18n as I18n } from "i18next";
import { errorKey, request } from "../api";
import { savePreference } from "../i18n";
import { m3MutationKey } from "../optimistic-m3";
import { meKey } from "../queries";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../query-snapshot";
import { synchronizeSession } from "../session-cache";

/** The signed-in user with a new locale and time zone, or the same value. */
export function withProfile(
  current: Me | null | undefined,
  locale: Locale,
  tz: string,
) {
  return current
    ? { ...current, user: { ...current.user, locale, tz } }
    : current;
}

/**
 * Saves the profile language and time zone. The language switches at once and
 * returns to the previous one when the write fails.
 */
export function useUpdateProfile({
  i18n,
  onStart,
  onFailure,
}: {
  i18n: I18n;
  /** Runs when the optimistic write starts (clear a shown error). */
  onStart?: () => void;
  /** Runs after a current-session rollback, with the error message key. */
  onFailure?: (key: string) => void;
}) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: ({ locale, tz }: { locale: Locale; tz: string }) =>
      request("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(profileSchema.parse({ locale, tz })),
      }),
    onMutate: async ({ locale, tz }) => {
      const snapshot = await snapshotQueries(client, [meKey]);
      const previous = i18n.language;
      client.setQueryData<Me | null>(meKey, (current) =>
        withProfile(current, locale, tz),
      );
      onStart?.();
      void i18n.changeLanguage(locale);
      return { previous, snapshot };
    },
    onSuccess: (_, { locale, tz }, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      savePreference(locale);
      client.setQueryData<Me | null>(meKey, (current) =>
        withProfile(current, locale, tz),
      );
    },
    onError: (_, __, context) => {
      if (!isCurrentSnapshot(client, context?.snapshot)) return;
      restoreQueries(client, context?.snapshot);
      void i18n.changeLanguage(context?.previous ?? "en");
      onFailure?.("errors.profile");
    },
    onSettled: () => client.invalidateQueries({ queryKey: meKey }),
  });
}

/**
 * Signs out, clears every cached query and leaves the signed-out session in
 * the cache. The caller resets its own selection state in `onSignedOut`.
 */
export function useSignOut({
  onSignedOut,
  onFailure,
}: {
  onSignedOut?: () => void;
  onFailure?: (key: string) => void;
} = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request("/api/auth/sign-out", { method: "POST", body: "{}" }),
    onSuccess: () => {
      synchronizeSession(client, null);
      client.clear();
      client.setQueryData(meKey, null);
      onSignedOut?.();
    },
    onError: (error) => onFailure?.(errorKey(error)),
  });
}
