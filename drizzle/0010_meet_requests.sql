CREATE TABLE "meet_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lens" text NOT NULL,
	"from_participant" uuid NOT NULL,
	"to_participant" uuid NOT NULL,
	"place" text NOT NULL,
	"time" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "meet_requests_not_self" CHECK ("meet_requests"."from_participant" <> "meet_requests"."to_participant"),
	CONSTRAINT "meet_requests_status" CHECK ("meet_requests"."status" in ('pending', 'accepted', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "meet_requests" ADD CONSTRAINT "meet_requests_from_participant_participants_id_fk" FOREIGN KEY ("from_participant") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meet_requests" ADD CONSTRAINT "meet_requests_to_participant_participants_id_fk" FOREIGN KEY ("to_participant") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meet_requests_one_pending" ON "meet_requests" USING btree ("lens","from_participant","to_participant") WHERE "meet_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "meet_requests_to_idx" ON "meet_requests" USING btree ("to_participant","created_at");--> statement-breakpoint
CREATE INDEX "meet_requests_from_idx" ON "meet_requests" USING btree ("from_participant","created_at");