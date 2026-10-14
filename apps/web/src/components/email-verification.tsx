"use client";
import { emailVerificationStatusSchema } from "@taff/schemas";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import {
  emailVerificationKey,
  useConfirmEmailVerification,
  useRequestEmailVerification,
} from "../lib/mutations/email-verification";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useWorkspace } from "./app-shell";
import { useWorkspaceSelection } from "./providers";
import { Button } from "./ui/button";

export function EmailVerification({ token = false }: { token?: boolean }) {
  const { t } = useTranslation();
  const { me, confirmed } = useWorkspace();
  const { emailVerificationToken, setEmailVerificationToken } =
    useWorkspaceSelection();
  const key = emailVerificationKey(me.user.id);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const status = useQuery({
    queryKey: key,
    enabled: confirmed,
    staleTime: 0,
    retry: false,
    queryFn: async () =>
      emailVerificationStatusSchema.parse(
        await request("/api/me/email-verification", { cache: "no-store" }),
      ),
  });
  const send = useRequestEmailVerification(me.user.id);
  const verify = useConfirmEmailVerification(
    me.user.id,
    emailVerificationToken,
    { onVerified: () => setEmailVerificationToken(null) },
  );
  const error = status.error ?? send.error ?? verify.error;
  return (
    <section
      className={token ? "invite-banner" : "field"}
      data-testid="email-verification"
    >
      <h2>{t("emailVerification.title")}</h2>
      <p className="section-hint">
        {t(token ? "emailVerification.confirmHint" : "emailVerification.hint", {
          email: me.user.email,
        })}
      </p>
      {!status.isError && (
        <p
          className="section-hint"
          role="status"
          data-testid="email-verification-status"
        >
          {t(
            status.isPending
              ? "loading"
              : status.data?.emailVerified
                ? "emailVerification.verified"
                : "emailVerification.unverified",
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {t(errorKey(error))}
        </p>
      )}
      {send.data?.delivery && (
        <p
          role={send.data.delivery === "failed" ? "alert" : "status"}
          data-testid="email-delivery-status"
        >
          {t(`emailVerification.delivery.${send.data.delivery}`)}
        </p>
      )}
      {token ? (
        <div className="action-row">
          <Button
            data-testid="verify-email-confirm"
            disabled={!confirmed || busy || !emailVerificationToken}
            onClick={() => verify.mutate()}
          >
            {t(verify.isPending ? "working" : "emailVerification.confirm")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => setEmailVerificationToken(null)}
          >
            {t("organization.dismiss")}
          </Button>
        </div>
      ) : (
        !status.data?.emailVerified && (
          <Button
            data-testid="request-email-verification"
            disabled={!confirmed || busy || status.isPending || status.isError}
            onClick={() => send.mutate()}
          >
            {t(send.isPending ? "working" : "emailVerification.request")}
          </Button>
        )
      )}
      {status.isError && (
        <Button disabled={busy} onClick={() => void status.refetch()}>
          {t("retry")}
        </Button>
      )}
    </section>
  );
}
