-- Tickets the public demo makes up to keep its kitchen screen busy. They never take kitchen-slot
-- capacity, so they cannot crowd out a visitor's real order. Always false on a real installation.
ALTER TABLE "orders" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;
