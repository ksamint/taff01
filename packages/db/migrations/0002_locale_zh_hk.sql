ALTER TABLE "users" DROP CONSTRAINT "users_locale";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_locale" CHECK ("users"."locale" in ('en', 'zh-CN', 'zh-HK'));