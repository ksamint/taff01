"use client";

import { verifyPhoneOtpSchema } from "@taff/schemas/base";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../lib/api";
import { useSendPhoneOtp, useVerifyPhoneOtp } from "../lib/mutations/auth";
import { mainlandPhone } from "../lib/phone";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/**
 * Second sign-in step for a mainland mobile number: one tap texts the code,
 * and the person can switch to a password instead. Nothing is sent until
 * they ask, so password users never trigger an SMS.
 */
export function SmsAuth({
  phone,
  onUsePassword,
}: {
  phone: string;
  onUsePassword: () => void;
}) {
  const { t } = useTranslation();
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
  const send = useSendPhoneOtp({
    onSent: (phoneNumber) => {
      setDestination(phoneNumber);
      setCode("");
      startCooldown(60);
      verify.reset();
    },
    onRateLimited: startCooldown,
  });
  const verify = useVerifyPhoneOtp();
  const pending = send.isPending || verify.isPending;
  function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const phoneNumber = mainlandPhone(phone);
    setInvalid(phoneNumber === null);
    if (phoneNumber && !pending && cooldown === 0) {
      verify.reset();
      send.mutate(phoneNumber);
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
      <form onSubmit={destination ? signIn : sendCode} noValidate>
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
              autoFocus
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
          data-testid="sms-submit"
          autoFocus={!destination}
          className="button-primary button-full"
          type="submit"
          disabled={pending || (!destination && cooldown > 0)}
        >
          {t(pending ? "working" : destination ? "sms.verify" : "sms.send")}
        </Button>
      </form>
      <p className="field-hint">{t("sms.accountHint")}</p>
      {destination && (
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
      )}
      <Button
        data-testid="phone-auth-toggle"
        className="button-link"
        disabled={pending}
        onClick={onUsePassword}
      >
        {t("sms.usePassword")}
      </Button>
    </>
  );
}
