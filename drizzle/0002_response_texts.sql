ALTER TABLE "quiz_responses" ADD COLUMN "instrument_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_responses" ADD COLUMN "scenario" text NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_responses" ADD COLUMN "most_text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_responses" ADD COLUMN "least_text" text;--> statement-breakpoint
ALTER TABLE "quiz_responses" ADD CONSTRAINT "quiz_responses_least_text_with_key" CHECK (("quiz_responses"."least_key" is null) = ("quiz_responses"."least_text" is null));