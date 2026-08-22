CREATE TABLE "latent_estimates" (
	"participant_id" uuid NOT NULL,
	"pillar" text NOT NULL,
	"mean" double precision NOT NULL,
	"se" double precision NOT NULL,
	"scorer_version" text NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "latent_estimates_participant_id_pillar_pk" PRIMARY KEY("participant_id","pillar"),
	CONSTRAINT "latent_estimates_mean_range" CHECK ("latent_estimates"."mean" between 0 and 1),
	CONSTRAINT "latent_estimates_se_positive" CHECK ("latent_estimates"."se" > 0),
	CONSTRAINT "latent_estimates_pillar" CHECK ("latent_estimates"."pillar" in ('regulation', 'politeness', 'reliability', 'agency'))
);
--> statement-breakpoint
ALTER TABLE "latent_estimates" ADD CONSTRAINT "latent_estimates_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;