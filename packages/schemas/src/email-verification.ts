import {
  boolean,
  type infer as Infer,
  maxLength,
  minLength,
  nullable,
  strictObject,
  string,
  trim,
  enum as zodEnum,
} from "zod/mini";

export const emailDeliverySchema = zodEnum(["sent", "logged", "failed"]);
export const emailVerificationRequestSchema = strictObject({});
export const emailVerificationConsumeSchema = strictObject({
  token: string().check(trim(), minLength(1), maxLength(4096)),
});
export const emailVerificationStatusSchema = strictObject({
  emailVerified: boolean(),
});
export const emailVerificationRequestResultSchema = strictObject({
  emailVerified: boolean(),
  delivery: nullable(emailDeliverySchema),
});
export type EmailDelivery = Infer<typeof emailDeliverySchema>;
export type EmailVerificationConsume = Infer<
  typeof emailVerificationConsumeSchema
>;
export type EmailVerificationRequest = Infer<
  typeof emailVerificationRequestSchema
>;
export type EmailVerificationStatus = Infer<
  typeof emailVerificationStatusSchema
>;
export type EmailVerificationRequestResult = Infer<
  typeof emailVerificationRequestResultSchema
>;
