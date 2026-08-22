CREATE TYPE "public"."gender" AS ENUM('M', 'F', 'NB');--> statement-breakpoint
CREATE TYPE "public"."option_key" AS ENUM('a', 'b', 'c', 'd');--> statement-breakpoint
CREATE TABLE "business_gates" (
	"participant_id" uuid PRIMARY KEY NOT NULL,
	"risk_posture" smallint NOT NULL,
	"exit_horizon" smallint NOT NULL,
	"redlines_ok" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_gates_risk_posture" CHECK ("business_gates"."risk_posture" between 0 and 2),
	CONSTRAINT "business_gates_exit_horizon" CHECK ("business_gates"."exit_horizon" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "romantic_gates" (
	"participant_id" uuid PRIMARY KEY NOT NULL,
	"gender" "gender" NOT NULL,
	"interested_in" "gender"[] NOT NULL,
	"single" boolean NOT NULL,
	"age_band" smallint NOT NULL,
	"wants_kids" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "romantic_gates_interested_in_nonempty" CHECK (cardinality("romantic_gates"."interested_in") >= 1),
	CONSTRAINT "romantic_gates_age_band" CHECK ("romantic_gates"."age_band" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "acquaintances" (
	"participant_id" uuid NOT NULL,
	"knows_id" uuid NOT NULL,
	CONSTRAINT "acquaintances_participant_id_knows_id_pk" PRIMARY KEY("participant_id","knows_id"),
	CONSTRAINT "acquaintances_not_self" CHECK ("acquaintances"."participant_id" <> "acquaintances"."knows_id")
);
--> statement-breakpoint
CREATE TABLE "participant_sessions" (
	"token" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_sessions_participant_id_unique" UNIQUE("participant_id")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"room_id" uuid NOT NULL,
	"name" text NOT NULL,
	"photo_url" text,
	"team" text,
	"track" text,
	"consent_romantic" boolean DEFAULT false NOT NULL,
	"consent_business" boolean DEFAULT false NOT NULL,
	"consent_friendship" boolean DEFAULT false NOT NULL,
	"money_posture" smallint,
	"rootedness" smallint,
	"family_gravity" smallint,
	"capacity_hours_band" smallint,
	"distance_band" smallint,
	"chronotype" smallint,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"declared_at" timestamp with time zone,
	"quiz_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_name_length" CHECK (length("participants"."name") between 1 and 80),
	CONSTRAINT "participants_money_posture_band" CHECK ("participants"."money_posture" is null or "participants"."money_posture" between 0 and 3),
	CONSTRAINT "participants_rootedness_band" CHECK ("participants"."rootedness" is null or "participants"."rootedness" between 0 and 3),
	CONSTRAINT "participants_family_gravity_band" CHECK ("participants"."family_gravity" is null or "participants"."family_gravity" between 0 and 3),
	CONSTRAINT "participants_capacity_hours_band" CHECK ("participants"."capacity_hours_band" is null or "participants"."capacity_hours_band" between 0 and 3),
	CONSTRAINT "participants_distance_band" CHECK ("participants"."distance_band" is null or "participants"."distance_band" between 0 and 3),
	CONSTRAINT "participants_chronotype_band" CHECK ("participants"."chronotype" is null or "participants"."chronotype" between 0 and 3),
	CONSTRAINT "participants_tags_cap" CHECK (cardinality("participants"."tags") <= 12),
	CONSTRAINT "participants_declared_complete" CHECK ("participants"."declared_at" is null or (
        "participants"."money_posture" is not null and
        "participants"."rootedness" is not null and
        "participants"."family_gravity" is not null and
        "participants"."capacity_hours_band" is not null and
        "participants"."distance_band" is not null and
        "participants"."chronotype" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "quiz_responses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"participant_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"most_key" "option_key" NOT NULL,
	"least_key" "option_key",
	"shown_order" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_responses_position" CHECK ("quiz_responses"."position" between 1 and 15),
	CONSTRAINT "quiz_responses_least_not_most" CHECK ("quiz_responses"."least_key" is null or "quiz_responses"."least_key" <> "quiz_responses"."most_key"),
	CONSTRAINT "quiz_responses_shown_order" CHECK (length("quiz_responses"."shown_order") = 4)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"instrument_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "business_gates" ADD CONSTRAINT "business_gates_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romantic_gates" ADD CONSTRAINT "romantic_gates_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquaintances" ADD CONSTRAINT "acquaintances_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquaintances" ADD CONSTRAINT "acquaintances_knows_id_participants_id_fk" FOREIGN KEY ("knows_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_sessions" ADD CONSTRAINT "participant_sessions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_responses" ADD CONSTRAINT "quiz_responses_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participants_room_id_idx" ON "participants" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_responses_participant_position" ON "quiz_responses" USING btree ("participant_id","position");