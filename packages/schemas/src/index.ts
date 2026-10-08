import { z } from "zod";

export const localeSchema = z.enum(["en", "zh-CN"]);
export const idSchema = z.string().uuid();
export const workspaceQuerySchema = z
  .object({ workspaceId: idSchema })
  .strict();
export const createTaskSchema = z
  .object({
    workspaceId: idSchema,
    title: z.string().trim().min(1).max(200),
    ownerId: idSchema,
    workerId: idSchema.nullable().default(null),
    dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict();
export const assignTaskSchema = z
  .object({ workerId: idSchema.nullable() })
  .strict();
export const signInSchema = z
  .object({ email: z.email(), password: z.string().min(8).max(128) })
  .strict();
export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(1).max(100),
});
export const signOutSchema = z.object({}).strict();
export const profileSchema = z
  .object({
    locale: localeSchema,
    tz: z
      .string()
      .min(1)
      .max(100)
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "Invalid time zone"),
  })
  .strict();
export const memberSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  userId: z.string().nullable(),
  name: z.string(),
  kind: z.enum(["person", "agent"]),
  role: z.enum(["admin", "member"]),
});
export const taskSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  title: z.string(),
  ownerId: idSchema,
  workerId: idSchema.nullable(),
  status: z.enum(["todo", "in_progress", "needs_review", "done"]),
  dueAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const meSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    locale: localeSchema,
    tz: z.string(),
  }),
  workspaces: z.array(
    z.object({ id: idSchema, name: z.string(), memberId: idSchema }),
  ),
});
export const errorSchema = z.object({
  error: z.enum([
    "unauthorized",
    "forbidden",
    "not_found",
    "invalid_input",
    "conflict",
    "internal_error",
  ]),
});
export type CreateTask = z.infer<typeof createTaskSchema>;
export type AssignTask = z.infer<typeof assignTaskSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Me = z.infer<typeof meSchema>;
export type Locale = z.infer<typeof localeSchema>;
