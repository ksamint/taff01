// Sign-in and sign-up mutations (email, username and SMS one-time codes).
import type {
  phonePasswordSignInSchema,
  signInSchema,
  signUpSchema,
  usernameSignInSchema,
  verifyPhoneOtpSchema,
} from "@taff/schemas/base";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, request } from "../api";
import { meKey } from "../queries";
import { clearWorkspaceSession } from "../workspace-preference";

export type CredentialAuth = {
  endpoint:
    | "sign-up/email"
    | "sign-in/email"
    | "sign-in/username"
    | "sign-in/phone-number";
  body:
    | ReturnType<typeof signUpSchema.parse>
    | ReturnType<typeof signInSchema.parse>
    | ReturnType<typeof usernameSignInSchema.parse>
    | ReturnType<typeof phonePasswordSignInSchema.parse>;
};

/** Signs up or in with a password, then refreshes the session. */
export function useCredentialAuth() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ endpoint, body }: CredentialAuth) =>
      request(`/api/auth/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      clearWorkspaceSession();
      await client.invalidateQueries({ queryKey: meKey });
    },
  });
}

/**
 * Sends an SMS one-time code. `onSent` receives the destination number;
 * `onRateLimited` receives the cooldown in seconds after a 429.
 */
export function useSendPhoneOtp({
  onSent,
  onRateLimited,
}: {
  onSent?: (phoneNumber: string) => void;
  onRateLimited?: (seconds: number) => void;
} = {}) {
  return useMutation({
    mutationFn: (phoneNumber: string) =>
      request("/api/auth/phone-number/send-otp", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      }),
    onSuccess: (_response, phoneNumber) => onSent?.(phoneNumber),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429)
        onRateLimited?.(error.retryAfter ?? 60);
    },
  });
}

/** Verifies an SMS one-time code, then refreshes the session. */
export function useVerifyPhoneOtp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnType<typeof verifyPhoneOtpSchema.parse>) =>
      request("/api/auth/phone-number/verify", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      clearWorkspaceSession();
      await client.invalidateQueries({ queryKey: meKey });
    },
  });
}
