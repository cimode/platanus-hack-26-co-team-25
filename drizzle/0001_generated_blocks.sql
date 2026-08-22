CREATE TABLE "generated_blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"participant_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"batch" smallint NOT NULL,
	"focus_pillar" text NOT NULL,
	"domain" text NOT NULL,
	"scenario" text NOT NULL,
	"options" jsonb NOT NULL,
	"source" text DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generated_blocks_participant_position" UNIQUE("participant_id","position")
);
--> statement-breakpoint
ALTER TABLE "generated_blocks" ADD CONSTRAINT "generated_blocks_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_blocks_participant_batch" ON "generated_blocks" USING btree ("participant_id","batch");