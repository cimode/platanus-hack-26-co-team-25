CREATE TABLE "pair_simulations" (
	"lens" text NOT NULL,
	"participant_lo" uuid NOT NULL,
	"participant_hi" uuid NOT NULL,
	"life" jsonb NOT NULL,
	"scorer_version" text NOT NULL,
	"lo_computed_at" timestamp with time zone NOT NULL,
	"hi_computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pair_simulations_lens_participant_lo_participant_hi_pk" PRIMARY KEY("lens","participant_lo","participant_hi"),
	CONSTRAINT "pair_simulations_order" CHECK ("pair_simulations"."participant_lo" < "pair_simulations"."participant_hi")
);
--> statement-breakpoint
ALTER TABLE "pair_simulations" ADD CONSTRAINT "pair_simulations_participant_lo_participants_id_fk" FOREIGN KEY ("participant_lo") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_simulations" ADD CONSTRAINT "pair_simulations_participant_hi_participants_id_fk" FOREIGN KEY ("participant_hi") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;