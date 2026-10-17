"use client";

import {
  authMethodsSchema,
  phonePasswordSignInSchema,
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

/**
 * Sign-in asks for the account first (username, mobile or email), then for
 * a password, or for a texted code when the account is a mainland mobile
 * and SMS is on. Sign-up stays one form.
 */
type Step = "identify" | "password" | "code";

export function Auth() {
  const { t } = useTranslation();
  const [signup, setSignup] = useState(false);
  const [focusAccount, setFocusAccount] = useState(false);
  const [step, setStep] = useState<Step>("identify");
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
  const account = identifier.trim();
  const phone = signup ? null : mainlandPhone(account);
  function clearErrors() {
    setValidationError(false);
    auth.reset();
  }
  function goTo(next: Step) {
    setFocusAccount(next === "identify");
    clearErrors();
    setStep(next);
  }
  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) {
      setValidationError(true);
      return;
    }
    let sms = smsEnabled;
    if (phone && methods.isPending) {
      const loaded = await methods.refetch();
      sms = loaded.data?.smsEnabled === true;
    }
    goTo(phone && sms ? "code" : "password");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    if (signup) {
      const username = String(form.get("username") ?? "").trim();
      const parsed = signUpSchema.safeParse({
        email: account,
        name: form.get("name"),
        password,
        ...(username ? { username } : {}),
      });
      setValidationError(!parsed.success);
      if (parsed.success)
        auth.mutate({ endpoint: "sign-up/email", body: parsed.data });
      return;
    }
    const endpoint = phone
      ? "sign-in/phone-number"
      : account.includes("@")
        ? "sign-in/email"
        : "sign-in/username";
    const parsed = phone
      ? phonePasswordSignInSchema.safeParse({ phoneNumber: phone, password })
      : account.includes("@")
        ? signInSchema.safeParse({ email: account, password })
        : usernameSignInSchema.safeParse({ username: account, password });
    setValidationError(!parsed.success);
    if (parsed.success) auth.mutate({ endpoint, body: parsed.data });
  }
  const errorAlert = (validationError || auth.isError) && (
    <p className="alert" role="alert">
      {t(
        validationError
          ? "errors.invalid_input"
          : auth.error instanceof ApiError && auth.error.code === "network"
            ? "errors.network"
            : signup
              ? "errors.signup"
              : "errors.auth",
      )}
    </p>
  );
  const passwordField = (
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
        autoFocus={!signup}
        aria-describedby="password-hint"
      />
      <p id="password-hint" className="field-hint">
        {t(signup ? "passwordHint" : "signInPasswordHint")}
      </p>
    </div>
  );
  const identifierInput = (
    <Input
      id="auth-email"
      data-testid="auth-email"
      name="email"
      type={signup ? "email" : "text"}
      autoComplete={signup ? "email" : "username"}
      autoFocus={!signup && focusAccount}
      value={identifier}
      onChange={(event) => setIdentifier(event.target.value)}
      required
    />
  );
  return (
    <div className="auth-layout">
      <section className="panel auth-panel" aria-labelledby="auth-heading">
        <h2 id="auth-heading" className={signup ? undefined : "sr-only"}>
          {t(signup ? "signUp" : step === "code" ? "sms.title" : "signIn")}
        </h2>
        {signup ? (
          <form key="signup" onSubmit={submit} noValidate>
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
            <div className="field">
              <Label htmlFor="auth-email">{t("email")}</Label>
              {identifierInput}
            </div>
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
            {passwordField}
            {errorAlert}
            <Button
              data-testid="auth-submit"
              className="button-primary button-full"
              type="submit"
              disabled={auth.isPending}
            >
              {t(auth.isPending ? "working" : "signUp")}
            </Button>
          </form>
        ) : step === "identify" ? (
          <form key="identify" onSubmit={identify} noValidate>
            <div className="field">
              <Label htmlFor="auth-email">{t("accountIdentifier")}</Label>
              {identifierInput}
            </div>
            {errorAlert}
            <Button
              data-testid="auth-continue"
              className="button-primary button-full"
              type="submit"
            >
              {t("continue")}
            </Button>
          </form>
        ) : (
          <>
            <div className="auth-identity">
              <span data-testid="auth-identity">{account}</span>
              <Button
                data-testid="auth-change"
                className="button-link"
                disabled={auth.isPending}
                onClick={() => goTo("identify")}
              >
                {t("changeAccount")}
              </Button>
            </div>
            {step === "code" && phone ? (
              <SmsAuth phone={phone} onUsePassword={() => goTo("password")} />
            ) : (
              <>
                <form key="password" onSubmit={submit} noValidate>
                  {/* Lets password managers pair the saved account. */}
                  <input
                    className="sr-only"
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={account}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  {passwordField}
                  {errorAlert}
                  <Button
                    data-testid="auth-submit"
                    className="button-primary button-full"
                    type="submit"
                    disabled={auth.isPending}
                  >
                    {t(auth.isPending ? "working" : "signIn")}
                  </Button>
                </form>
                {phone && smsEnabled && (
                  <Button
                    data-testid="phone-auth-toggle"
                    className="button-link"
                    disabled={auth.isPending}
                    onClick={() => goTo("code")}
                  >
                    {t("sms.useCode")}
                  </Button>
                )}
              </>
            )}
          </>
        )}
        {(signup || step === "identify") && (
          <Button
            data-testid="auth-toggle"
            className="button-link"
            disabled={auth.isPending}
            onClick={() => {
              setSignup(!signup);
              goTo("identify");
            }}
          >
            {t(signup ? "haveAccount" : "needAccount")}
          </Button>
        )}
      </section>
    </div>
  );
}
