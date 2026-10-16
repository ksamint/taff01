"use client";

import {
  authMethodsSchema,
  signInSchema,
  signUpSchema,
  usernameSignInSchema,
} from "@taff/schemas/base";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, request } from "../lib/api";
import { useCredentialAuth } from "../lib/mutations/auth";
import { mainlandPhone } from "../lib/phone";
import { SmsAuth } from "./sms-auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function Auth() {
  const { t } = useTranslation();
  const [signup, setSignup] = useState(false);
  const [sms, setSms] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [validationError, setValidationError] = useState(false);
  const methods = useQuery({
    queryKey: ["auth-methods"],
    queryFn: async () =>
      authMethodsSchema.parse(await request("/api/auth/methods")),
    retry: false,
    staleTime: 60_000,
  });
  const auth = useCredentialAuth();
  const smsEnabled = methods.data?.smsEnabled === true;
  // A mainland mobile number signs in with a texted code; phone accounts
  // have no password.
  const phone = !signup && smsEnabled ? mainlandPhone(identifier) : null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phone) {
      setValidationError(false);
      auth.reset();
      setSms(true);
      return;
    }
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("email") ?? "").trim();
    const username = String(form.get("username") ?? "").trim();
    const password = form.get("password");
    const endpoint = signup
      ? "sign-up/email"
      : identifier.includes("@")
        ? "sign-in/email"
        : "sign-in/username";
    const parsed = signup
      ? signUpSchema.safeParse({
          email: identifier,
          name: form.get("name"),
          password,
          ...(username ? { username } : {}),
        })
      : identifier.includes("@")
        ? signInSchema.safeParse({ email: identifier, password })
        : usernameSignInSchema.safeParse({ username: identifier, password });
    setValidationError(!parsed.success);
    if (parsed.success) auth.mutate({ endpoint, body: parsed.data });
  }
  return (
    <div className="auth-layout">
      <section className="panel auth-panel" aria-labelledby="auth-heading">
        <h2 id="auth-heading" className={sms || signup ? undefined : "sr-only"}>
          {t(sms ? "sms.title" : signup ? "signUp" : "signIn")}
        </h2>
        {sms ? (
          <SmsAuth
            initialPhone={phone ?? undefined}
            onBack={() => {
              setSms(false);
              setIdentifier("");
            }}
          />
        ) : (
          <>
            <form onSubmit={submit} noValidate>
              {signup && (
                <div className="field">
                  <Label htmlFor="auth-name">{t("name")}</Label>
                  <Input
                    id="auth-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                  />
                </div>
              )}
              <div className="field">
                <Label htmlFor="auth-email">
                  {t(
                    signup
                      ? "email"
                      : smsEnabled
                        ? "accountIdentifier"
                        : "emailOrUsername",
                  )}
                </Label>
                <Input
                  id="auth-email"
                  data-testid="auth-email"
                  name="email"
                  type={signup ? "email" : "text"}
                  autoComplete={signup ? "email" : "username"}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </div>
              {signup && (
                <div className="field">
                  <Label htmlFor="auth-username">{t("usernameOptional")}</Label>
                  <Input
                    id="auth-username"
                    data-testid="auth-username"
                    name="username"
                    autoComplete="username"
                    minLength={2}
                    maxLength={30}
                    pattern="[A-Za-z0-9_.]{2,30}"
                    aria-describedby="username-hint"
                  />
                  <p id="username-hint" className="field-hint">
                    {t("usernameHint")}
                  </p>
                </div>
              )}
              {!phone && (
                <div className="field">
                  <Label htmlFor="auth-password">{t("password")}</Label>
                  <Input
                    id="auth-password"
                    data-testid="auth-password"
                    name="password"
                    type="password"
                    autoComplete={signup ? "new-password" : "current-password"}
                    minLength={signup ? 8 : 6}
                    maxLength={128}
                    required
                    aria-describedby="password-hint"
                  />
                  <p id="password-hint" className="field-hint">
                    {t(signup ? "passwordHint" : "signInPasswordHint")}
                  </p>
                </div>
              )}
              {(validationError || auth.isError) && (
                <p className="alert" role="alert">
                  {t(
                    validationError
                      ? "errors.invalid_input"
                      : auth.error instanceof ApiError &&
                          auth.error.code === "network"
                        ? "errors.network"
                        : signup
                          ? "errors.signup"
                          : "errors.auth",
                  )}
                </p>
              )}
              <Button
                data-testid="auth-submit"
                className="button-primary button-full"
                type="submit"
                disabled={auth.isPending}
              >
                {t(
                  auth.isPending
                    ? "working"
                    : signup
                      ? "signUp"
                      : phone
                        ? "sms.send"
                        : "signIn",
                )}
              </Button>
            </form>
            <Button
              data-testid="auth-toggle"
              className="button-link"
              disabled={auth.isPending}
              onClick={() => {
                setSignup(!signup);
                setValidationError(false);
                auth.reset();
              }}
            >
              {t(signup ? "haveAccount" : "needAccount")}
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
