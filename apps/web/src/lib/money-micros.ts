/// <reference lib="es2023.intl" />

export function decimalToMicros(amount: string) {
  // Assemble the integer from decimal digits before converting it to a number.
  const digits = /^(\d+)(?:\.(\d{1,6}))?$/.exec(amount);
  return digits
    ? Number(digits[1] + (digits[2] ?? "").padEnd(6, "0"))
    : Number.NaN;
}

export function microsToDecimal(micros: number) {
  const digits = String(micros).padStart(7, "0");
  const fraction = digits.slice(-6).replace(/0+$/, "");
  const whole = digits.slice(0, -6);
  return (fraction ? `${whole}.${fraction}` : whole) as `${number}`;
}

export function formatMoneyMicros(
  micros: number,
  currency: string,
  locale: string,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 6,
  }).format(microsToDecimal(micros));
}
