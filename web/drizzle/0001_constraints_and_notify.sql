-- Rules the ORM cannot express, enforced by PostgreSQL so that concurrent requests cannot
-- slip past them.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- A table is never booked twice at overlapping times. Cancelled and no-show bookings release
-- the table. Half-open ranges: a 19:00-20:30 booking and a 20:30 booking may both stand.
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap" EXCLUDE USING gist (
  "table_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("status" IN ('BOOKED', 'SEATED', 'COMPLETED'));
--> statement-breakpoint

ALTER TABLE "orders" ADD CONSTRAINT "orders_status_valid" CHECK ("status" IN (
  'AWAITING_PAYMENT', 'PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY',
  'DELIVERED', 'COLLECTED', 'CANCELLED', 'REJECTED', 'EXPIRED'
));
--> statement-breakpoint

ALTER TABLE "order_events" ADD CONSTRAINT "order_events_status_valid" CHECK ("status" IN (
  'AWAITING_PAYMENT', 'PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY',
  'DELIVERED', 'COLLECTED', 'CANCELLED', 'REJECTED', 'EXPIRED'
));
--> statement-breakpoint

-- Drizzle's text enums are checked only by TypeScript; these make the database agree.
ALTER TABLE "staff" ADD CONSTRAINT "staff_role_valid" CHECK ("role" IN ('MANAGER', 'KITCHEN'));
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_kind_valid" CHECK ("kind" IN ('STAFF', 'CUSTOMER'));
--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_kind_valid" CHECK ("kind" IN ('PERCENT', 'FLAT'));
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilment_valid" CHECK ("fulfilment" IN ('DELIVERY', 'PICKUP'));
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_valid" CHECK ("payment_method" IN ('ONLINE', 'ON_DELIVERY'));
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_valid" CHECK (
  "payment_status" IN ('PENDING', 'PAID', 'NOT_REQUIRED', 'REFUND_PENDING', 'REFUNDED')
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_valid" CHECK ("actor" IN ('CUSTOMER', 'KITCHEN', 'SYSTEM'));
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_valid" CHECK (
  "status" IN ('CREATED', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED')
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_status_valid" CHECK (
  "status" IN ('BOOKED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
);
--> statement-breakpoint

-- Online orders are always paid before the kitchen sees them.
ALTER TABLE "orders" ADD CONSTRAINT "orders_online_paid_before_kitchen" CHECK (
  "payment_method" <> 'ONLINE'
  OR "status" IN ('AWAITING_PAYMENT', 'EXPIRED')
  OR "payment_status" IN ('PAID', 'REFUND_PENDING', 'REFUNDED')
);
--> statement-breakpoint

-- Live updates. Every change to an order's status or payment is announced on the "orders"
-- channel; the app LISTENs once per server process and fans the news out to the kitchen screen
-- and to customers tracking that order. Because the notification is sent at commit, listeners
-- never hear about a change that was rolled back.
CREATE FUNCTION notify_order_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('orders', json_build_object(
    'id', NEW.id,
    'code', NEW.code,
    'status', NEW.status,
    'paymentStatus', NEW.payment_status
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER orders_notify_insert AFTER INSERT ON "orders"
  FOR EACH ROW EXECUTE FUNCTION notify_order_change();
--> statement-breakpoint

CREATE TRIGGER orders_notify_update AFTER UPDATE OF "status", "payment_status" ON "orders"
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status)
  EXECUTE FUNCTION notify_order_change();
