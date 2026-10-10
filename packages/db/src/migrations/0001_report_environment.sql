ALTER TABLE "bug_report" ALTER COLUMN "visibility" SET DEFAULT 'public';--> statement-breakpoint
ALTER TABLE "bug_report_upload_session" ALTER COLUMN "visibility" SET DEFAULT 'public';--> statement-breakpoint
ALTER TABLE "bug_report" ADD COLUMN "environment" jsonb;--> statement-breakpoint
ALTER TABLE "bug_report_upload_session" ADD COLUMN "environment" jsonb;