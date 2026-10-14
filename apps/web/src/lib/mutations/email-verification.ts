// Email verification mutations (request a link, confirm a token).
import {
  emailVerificationConsumeSchema,
  emailVerificationRequestResultSchema,
  emailVerificationStatusSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api";
import { m3MutationKey } from "../optimistic-m3";
import { isCurrentSnapshot, snapshotQueries } from "../query-snapshot";

export const emailVerificationKey = (userId: string) => [
  "email-verification",
  userId,
];

/** Sends a verification email and records whether the address is verified. */
export function useRequestEmailVerification(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async () =>
      emailVerificationRequestResultSchema.parse(
        await request("/api/me/email-verification/request", {
          method: "POST",
          body: "{}",
        }),
      ),
    onMutate: () => snapshotQueries(client, []),
    onSuccess: (value, _, snapshot) => {
      if (isCurrentSnapshot(client, snapshot))
        client.setQueryData(emailVerificationKey(userId), {
          emailVerified: value.emailVerified,
        });
    },
  });
}

/** Confirms the emailed token; `onVerified` forgets the consumed token. */
export function useConfirmEmailVerification(
  userId: string,
  token: string | null,
  { onVerified }: { onVerified?: () => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async () =>
      emailVerificationStatusSchema.parse(
        await request("/api/me/email-verification/verify", {
          method: "POST",
          body: JSON.stringify(emailVerificationConsumeSchema.parse({ token })),
        }),
      ),
    onMutate: () => snapshotQueries(client, []),
    onSuccess: (value, _, snapshot) => {
      if (!isCurrentSnapshot(client, snapshot)) return;
      client.setQueryData(emailVerificationKey(userId), value);
      onVerified?.();
    },
  });
}
