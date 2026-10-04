CREATE TABLE "addon_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"name" text NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "addon_groups_range" CHECK ("addon_groups"."min_select" >= 0 and "addon_groups"."max_select" >= greatest("addon_groups"."min_select", 1))
);
--> statement-breakpoint
CREATE TABLE "addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"price_paise" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "addons_price_non_negative" CHECK ("addons"."price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"label" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"landmark" text,
	"pincode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"order_id" integer PRIMARY KEY NOT NULL,
	"coupon_code" text NOT NULL,
	"customer_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"min_order_paise" integer DEFAULT 0 NOT NULL,
	"max_discount_paise" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"first_order_only" boolean DEFAULT false NOT NULL,
	"per_customer_limit" integer,
	CONSTRAINT "coupons_code_upper" CHECK ("coupons"."code" = upper("coupons"."code")),
	CONSTRAINT "coupons_value_positive" CHECK ("coupons"."value" > 0),
	CONSTRAINT "coupons_percent_range" CHECK ("coupons"."kind" <> 'PERCENT' or "coupons"."value" <= 10000),
	CONSTRAINT "coupons_window" CHECK ("coupons"."ends_at" > "coupons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"seats" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "dining_tables_label_unique" UNIQUE("label"),
	CONSTRAINT "dining_tables_seats" CHECK ("dining_tables"."seats" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "item_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"name" text NOT NULL,
	"price_paise" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_variants_price_non_negative" CHECK ("item_variants"."price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_paise" integer NOT NULL,
	"veg" boolean NOT NULL,
	"spice" integer DEFAULT 0 NOT NULL,
	"bestseller" boolean DEFAULT false NOT NULL,
	"image_path" text,
	"available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "menu_items_price_non_negative" CHECK ("menu_items"."price_paise" >= 0),
	CONSTRAINT "menu_items_spice_range" CHECK ("menu_items"."spice" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"status" text NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"item_id" integer,
	"name" text NOT NULL,
	"variant_name" text,
	"addons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"line_total_paise" integer NOT NULL,
	CONSTRAINT "order_items_quantity" CHECK ("order_items"."quantity" between 1 and 20),
	CONSTRAINT "order_items_line_total" CHECK ("order_items"."line_total_paise" = "order_items"."unit_price_paise" * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"customer_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"fulfilment" text NOT NULL,
	"address" jsonb,
	"slot_start" timestamp with time zone NOT NULL,
	"scheduled" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"payment_method" text NOT NULL,
	"payment_status" text NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"packaging_paise" integer DEFAULT 0 NOT NULL,
	"delivery_fee_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"coupon_code" text,
	"notes" text,
	"reject_reason" text,
	"payment_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code"),
	CONSTRAINT "orders_total_adds_up" CHECK ("orders"."total_paise" = "orders"."subtotal_paise" - "orders"."discount_paise" + "orders"."packaging_paise" + "orders"."delivery_fee_paise" + "orders"."tax_paise"),
	CONSTRAINT "orders_discount_within_subtotal" CHECK ("orders"."discount_paise" between 0 and "orders"."subtotal_paise"),
	CONSTRAINT "orders_address_iff_delivery" CHECK (("orders"."fulfilment" = 'DELIVERY') = ("orders"."address" is not null))
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"request_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"amount_paise" integer NOT NULL,
	"status" text NOT NULL,
	"refund_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payments_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"customer_id" integer NOT NULL,
	"table_id" integer NOT NULL,
	"party_size" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_code_unique" UNIQUE("code"),
	CONSTRAINT "reservations_window" CHECK ("reservations"."ends_at" > "reservations"."starts_at"),
	CONSTRAINT "reservations_party" CHECK ("reservations"."party_size" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addon_groups" ADD CONSTRAINT "addon_groups_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addons" ADD CONSTRAINT "addons_group_id_addon_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."addon_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_code_coupons_code_fk" FOREIGN KEY ("coupon_code") REFERENCES "public"."coupons"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_code_coupons_code_fk" FOREIGN KEY ("coupon_code") REFERENCES "public"."coupons"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_customer" ON "coupon_redemptions" USING btree ("coupon_code","customer_id");--> statement-breakpoint
CREATE INDEX "menu_items_category" ON "menu_items" USING btree ("category_id","position");--> statement-breakpoint
CREATE INDEX "order_events_order" ON "order_events" USING btree ("order_id","at");--> statement-breakpoint
CREATE INDEX "orders_customer" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_slot" ON "orders" USING btree ("slot_start");--> statement-breakpoint
CREATE INDEX "orders_status" ON "orders" USING btree ("status","slot_start");--> statement-breakpoint
CREATE INDEX "otp_phone_recent" ON "otp_challenges" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "reservations_start" ON "reservations" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "reservations_customer" ON "reservations" USING btree ("customer_id","starts_at");--> statement-breakpoint
CREATE INDEX "sessions_subject" ON "sessions" USING btree ("kind","subject_id");