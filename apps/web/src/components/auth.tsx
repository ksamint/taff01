"use client";

import {
  authMethodsSchema,
  signInSchema,
  signUpSchema,
} from "@taff/schemas/base";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, request } from "../lib/api";
import { meKey } from "../lib/queries";
import { SmsAuth } from "./sms-auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function Auth() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [signup, setSignup] = useState(false);
  const [sms, setSms] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const methods = useQuery({
    queryKey: ["auth-methods"],
    queryFn: async () =>
      authMethodsSchema.parse(await request("/api/auth/methods")),
    retry: false,
    staleTime: 60_000,
  });
  const auth = useMutation({
    mutationFn: (
      body:
        | ReturnType<typeof signUpSchema.parse>
        | ReturnType<typeof signInSchema.parse>,
    ) =>
      request(`/api/auth/${signup ? "sign-up" : "sign-in"}/email`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: meKey });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      email: form.get("email"),
      password: form.get("password"),
      ...(signup ? { name: form.get("name") } : {}),
    };
    const parsed = (signup ? signUpSchema : signInSchema).safeParse(body);
    setValidationError(!parsed.success);
    if (parsed.success) auth.mutate(parsed.data);
  }
  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">{t("app")}</p>
        <h1>{t("welcome")}</h1>
        <p>{t("authDescription")}</p>
        <div className="accent-line" aria-hidden="true" />
      </div>
      <section className="panel auth-panel" aria-labelledby="auth-heading">
        <h2 id="auth-heading">
          {t(sms ? "sms.title" : signup ? "signUp" : "signIn")}
        </h2>
        {sms ? (
          <SmsAuth onBack={() => setSms(false)} />
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
                <Label htmlFor="auth-email">{t("email")}</Label>
                <Input
                  id="auth-email"
                  data-testid="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="field">
                <Label htmlFor="auth-password">{t("password")}</Label>
                <Input
                  id="auth-password"
                  data-testid="auth-password"
                  name="password"
                  type="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={8}
                  maxLength={128}
                  required
                  aria-describedby="password-hint"
                />
                <p id="password-hint" className="field-hint">
                  {t("passwordHint")}
                </p>
              </div>
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
                {t(auth.isPending ? "working" : signup ? "signUp" : "signIn")}
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
            {methods.data?.smsEnabled && (
              <Button
                className="button-link"
                disabled={auth.isPending}
                onClick={() => {
                  setSms(true);
                  setValidationError(false);
                  auth.reset();
                }}
              >
                {t("sms.title")}
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
