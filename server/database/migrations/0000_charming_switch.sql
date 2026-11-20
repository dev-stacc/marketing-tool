CREATE TYPE "public"."quiz_referral_source" AS ENUM('instagram', 'facebook', 'tiktok', 'reddit', 'discord', 'google', 'someone', 'other');--> statement-breakpoint
CREATE TABLE "budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_period" text NOT NULL,
	"total_budget_cents" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "channel_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "channel_budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"allocated_budget_cents" integer NOT NULL,
	"revenue_cents" integer,
	"users_acquired" integer,
	CONSTRAINT "channel_budget_budget_id_channel_id_unique" UNIQUE("budget_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"date" date NOT NULL,
	"revenue_cents" integer,
	"users_acquired" integer
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_budget_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE "budget_prediction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prediction_period" text NOT NULL,
	"budget_id" uuid NOT NULL,
	"total_budget_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_prediction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_prediction_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"allocated_budget_cents" integer NOT NULL,
	"predicted_revenue_cents" integer,
	"predicted_users_acquired" integer,
	CONSTRAINT "channel_prediction_budget_prediction_id_channel_id_unique" UNIQUE("budget_prediction_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text NOT NULL,
	"referral_source" "quiz_referral_source" DEFAULT 'other',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_answers_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
ALTER TABLE "channel_budget" ADD CONSTRAINT "channel_budget_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_budget" ADD CONSTRAINT "channel_budget_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend" ADD CONSTRAINT "spend_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result" ADD CONSTRAINT "result_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_channel_budget_id_channel_budget_id_fk" FOREIGN KEY ("channel_budget_id") REFERENCES "public"."channel_budget"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_prediction" ADD CONSTRAINT "budget_prediction_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_prediction" ADD CONSTRAINT "channel_prediction_budget_prediction_id_budget_prediction_id_fk" FOREIGN KEY ("budget_prediction_id") REFERENCES "public"."budget_prediction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_prediction" ADD CONSTRAINT "channel_prediction_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;