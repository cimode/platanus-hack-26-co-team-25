ALTER TABLE "participants" ADD COLUMN "gender" "gender";--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "birthdate" date;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_identity_pair" CHECK (("participants"."gender" is null) = ("participants"."birthdate" is null));