"use client";

import { sendPhoneOtpSchema, verifyPhoneOtpSchema } from "@taff/schemas/base";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, request } from "../lib/api";
import { meKey } from "../lib/queries";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function SmsAuth({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [phone, setPhone] = useState("");
  const [destination, setDestination] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setCooldown(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  function startCooldown(seconds: number) {
    setCooldown(seconds);
    setResendAt(Date.now() + seconds * 1000);
  }
  const send = useMutation({
    mutationFn: (phoneNumber: string) =>
      request("/api/auth/phone-number/send-otp", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      }),
    onSuccess: (_response, phoneNumber) => {
      setDestination(phoneNumber);
      setCode("");
      startCooldown(60);
      verify.reset();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429)
        startCooldown(error.retryAfter ?? 60);
    },
  });
  const verify = useMutation({
    mutationFn: (body: ReturnType<typeof verifyPhoneOtpSchema.parse>) =>
      request("/api/auth/phone-number/verify", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: meKey });
    },
  });
  const pending = send.isPending || verify.isPending;
  function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const compact = phone.replace(/[\s()-]/g, "");
    const parsed = sendPhoneOtpSchema.safeParse({
      phoneNumber: /^1\d{10}$/.test(compact) ? `+86${compact}` : compact,
    });
    setInvalid(!parsed.success);
    if (parsed.success && !pending && cooldown === 0) {
      verify.reset();
      send.mutate(parsed.data.phoneNumber);
    }
  }
  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = verifyPhoneOtpSchema.safeParse({
      phoneNumber: destination,
      code: code.trim(),
    });
    setInvalid(!parsed.success);
    if (parsed.success && !pending) verify.mutate(parsed.data);
  }
  const error = verify.error ?? send.error;
  const errorKey = invalid
    ? "errors.invalid_input"
    : error instanceof ApiError && error.code === "network"
      ? "errors.network"
      : error instanceof ApiError && error.status === 429
        ? "sms.rateLimited"
        : verify.isError
          ? "sms.invalidCode"
          : "sms.sendFailed";
  return (
    <>
      <p className="field-hint">{t("sms.accountHint")}</p>
      <form onSubmit={destination ? signIn : sendCode} noValidate>
        <div className="field">
          <Label htmlFor="sms-phone">{t("sms.phone")}</Label>
          <Input
            id="sms-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setInvalid(false);
              send.reset();
            }}
            disabled={pending || destination !== null}
            maxLength={24}
            required
            aria-describedby="sms-phone-hint"
          />
          <p id="sms-phone-hint" className="field-hint">
            {t("sms.phoneHint")}
          </p>
        </div>
        {destination && (
          <div className="field">
            <Label htmlFor="sms-code">{t("sms.code")}</Label>
            <Input
              id="sms-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setInvalid(false);
                verify.reset();
              }}
              maxLength={6}
              minLength={6}
              disabled={pending}
              required
              aria-describedby="sms-code-hint"
            />
            <p id="sms-code-hint" className="field-hint" role="status">
              {t("sms.sent")}
            </p>
          </div>
        )}
        {(invalid || send.isError || verify.isError) && (
          <p className="alert" role="alert">
            {t(errorKey)}
          </p>
        )}
        <Button
          className="button-primary button-full"
          type="submit"
          disabled={pending || (!destination && cooldown > 0)}
        >
          {t(pending ? "working" : destination ? "sms.verify" : "sms.send")}
        </Button>
      </form>
      {destination && (
        <>
          <Button
            data-testid="sms-resend"
            className="button-link"
            disabled={pending || cooldown > 0}
            onClick={() => sendCode()}
          >
            {cooldown > 0
              ? t("sms.resendIn", { count: cooldown })
              : t("sms.resend")}
          </Button>
          <Button
            className="button-link"
            disabled={pending}
            onClick={() => {
              setDestination(null);
              setCode("");
              setInvalid(false);
              verify.reset();
              send.reset();
            }}
          >
            {t("sms.changePhone")}
          </Button>
        </>
      )}
      <Button className="button-link" disabled={pending} onClick={onBack}>
        {t("sms.emailInstead")}
      </Button>
    </>
  );
}
