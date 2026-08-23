CREATE TABLE "quiz_generation_claims" (
	"scope" text PRIMARY KEY NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "quiz_pool_sets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"room_id" uuid NOT NULL,
	"blocks" jsonb NOT NULL,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_pool_sets" ADD CONSTRAINT "quiz_pool_sets_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_pool_sets" ADD CONSTRAINT "quiz_pool_sets_claimed_by_participants_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_pool_sets_room_unclaimed" ON "quiz_pool_sets" USING btree ("room_id","created_at") WHERE "quiz_pool_sets"."claimed_by" is null;