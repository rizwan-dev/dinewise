import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import type { OrderStatus } from '@/domain/order-status'

/**
 * Money is integer paise throughout. Constraints that must hold under concurrency (no double
 * booking of a table, a bill that adds up, a payment counted once) live here, in PostgreSQL,
 * rather than being trusted to application code. Those that Drizzle cannot express, such as
 * the exclusion constraint and the notify trigger, are in the hand-written migration.
 */

const money = (name: string) => integer(name).notNull()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

// --- People and sessions ---------------------------------------------------------------------

export const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['MANAGER', 'KITCHEN'] }).notNull(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  /** E.164, e.g. +919822011002. Verified by a one-time code before it is stored. */
  phone: text('phone').notNull().unique(),
  name: text('name'),
  createdAt: createdAt(),
})

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie's random token: a database leak does not leak live sessions. */
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['STAFF', 'CUSTOMER'] }).notNull(),
    subjectId: integer('subject_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_subject').on(t.kind, t.subjectId)],
)

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: serial('id').primaryKey(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    /** Where the code was requested from, for rate limiting. */
    requestIp: text('request_ip'),
    createdAt: createdAt(),
  },
  (t) => [index('otp_phone_recent').on(t.phone, t.createdAt)],
)

/**
 * Codes "sent" by the simulated SMS gateway. A real deployment swaps the gateway for an SMS
 * provider; the demo shows recent messages on a page so it can be used without one.
 */
export const smsOutbox = pgTable('sms_outbox', {
  id: serial('id').primaryKey(),
  phone: text('phone').notNull(),
  body: text('body').notNull(),
  createdAt: createdAt(),
})

export const addresses = pgTable('addresses', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  label: text('label').notNull(),
  line1: text('line1').notNull(),
  line2: text('line2'),
  landmark: text('landmark'),
  pincode: text('pincode').notNull(),
  createdAt: createdAt(),
})

// --- Menu ------------------------------------------------------------------------------------

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  position: integer('position').notNull().default(0),
})

export const menuItems = pgTable(
  'menu_items',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull().default(''),
    pricePaise: money('price_paise'),
    veg: boolean('veg').notNull(),
    /** 0 mild to 3 hot. */
    spice: integer('spice').notNull().default(0),
    bestseller: boolean('bestseller').notNull().default(false),
    imagePath: text('image_path'),
    available: boolean('available').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('menu_items_price_non_negative', sql`${t.pricePaise} >= 0`),
    check('menu_items_spice_range', sql`${t.spice} between 0 and 3`),
    index('menu_items_category').on(t.categoryId, t.position),
  ],
)

export const itemVariants = pgTable(
  'item_variants',
  {
    id: serial('id').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pricePaise: money('price_paise'),
    position: integer('position').notNull().default(0),
  },
  (t) => [check('item_variants_price_non_negative', sql`${t.pricePaise} >= 0`)],
)

export const addonGroups = pgTable(
  'addon_groups',
  {
    id: serial('id').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    minSelect: integer('min_select').notNull().default(0),
    maxSelect: integer('max_select').notNull().default(1),
    position: integer('position').notNull().default(0),
  },
  (t) => [check('addon_groups_range', sql`${t.minSelect} >= 0 and ${t.maxSelect} >= greatest(${t.minSelect}, 1)`)],
)

export const addons = pgTable(
  'addons',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .notNull()
      .references(() => addonGroups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pricePaise: money('price_paise'),
    position: integer('position').notNull().default(0),
  },
  (t) => [check('addons_price_non_negative', sql`${t.pricePaise} >= 0`)],
)

export const coupons = pgTable(
  'coupons',
  {
    code: text('code').primaryKey(),
    description: text('description').notNull(),
    kind: text('kind', { enum: ['PERCENT', 'FLAT'] }).notNull(),
    value: integer('value').notNull(),
    minOrderPaise: money('min_order_paise').default(0),
    maxDiscountPaise: integer('max_discount_paise'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    active: boolean('active').notNull().default(true),
    firstOrderOnly: boolean('first_order_only').notNull().default(false),
    perCustomerLimit: integer('per_customer_limit'),
  },
  (t) => [
    check('coupons_code_upper', sql`${t.code} = upper(${t.code})`),
    check('coupons_value_positive', sql`${t.value} > 0`),
    check('coupons_percent_range', sql`${t.kind} <> 'PERCENT' or ${t.value} <= 10000`),
    check('coupons_window', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)

// --- Orders ----------------------------------------------------------------------------------

export type AddressSnapshot = {
  label: string
  line1: string
  line2: string | null
  landmark: string | null
  pincode: string
}

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    /** Short, unguessable public reference used in tracking links, e.g. TL-7K3QX9. */
    code: text('code').notNull().unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    fulfilment: text('fulfilment', { enum: ['DELIVERY', 'PICKUP'] }).notNull(),
    /** Copied at order time, so editing a saved address never rewrites history. */
    address: jsonb('address').$type<AddressSnapshot>(),
    /** The kitchen slot the order is planned for: when it should be ready. */
    slotStart: timestamp('slot_start', { withTimezone: true }).notNull(),
    scheduled: boolean('scheduled').notNull().default(false),
    status: text('status').$type<OrderStatus>().notNull(),
    paymentMethod: text('payment_method', { enum: ['ONLINE', 'ON_DELIVERY'] }).notNull(),
    paymentStatus: text('payment_status', {
      enum: ['PENDING', 'PAID', 'NOT_REQUIRED', 'REFUND_PENDING', 'REFUNDED'],
    }).notNull(),
    subtotalPaise: money('subtotal_paise'),
    discountPaise: money('discount_paise').default(0),
    packagingPaise: money('packaging_paise').default(0),
    deliveryFeePaise: money('delivery_fee_paise').default(0),
    taxPaise: money('tax_paise'),
    totalPaise: money('total_paise'),
    couponCode: text('coupon_code').references(() => coupons.code),
    notes: text('notes'),
    rejectReason: text('reject_reason'),
    /** Unpaid online orders lapse at this time and free their kitchen slot. */
    paymentDueAt: timestamp('payment_due_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'orders_total_adds_up',
      sql`${t.totalPaise} = ${t.subtotalPaise} - ${t.discountPaise} + ${t.packagingPaise} + ${t.deliveryFeePaise} + ${t.taxPaise}`,
    ),
    check('orders_discount_within_subtotal', sql`${t.discountPaise} between 0 and ${t.subtotalPaise}`),
    check(
      'orders_address_iff_delivery',
      sql`(${t.fulfilment} = 'DELIVERY') = (${t.address} is not null)`,
    ),
    index('orders_customer').on(t.customerId, t.createdAt),
    index('orders_slot').on(t.slotStart),
    index('orders_status').on(t.status, t.slotStart),
  ],
)

export type AddonSnapshot = { id: number; name: string; pricePaise: number }

export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    itemId: integer('item_id').references(() => menuItems.id),
    name: text('name').notNull(),
    variantName: text('variant_name'),
    addons: jsonb('addons').$type<AddonSnapshot[]>().notNull().default([]),
    quantity: integer('quantity').notNull(),
    unitPricePaise: money('unit_price_paise'),
    lineTotalPaise: money('line_total_paise'),
  },
  (t) => [
    check('order_items_quantity', sql`${t.quantity} between 1 and 20`),
    check('order_items_line_total', sql`${t.lineTotalPaise} = ${t.unitPricePaise} * ${t.quantity}`),
  ],
)

export const orderEvents = pgTable(
  'order_events',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: text('status').$type<OrderStatus>().notNull(),
    actor: text('actor', { enum: ['CUSTOMER', 'KITCHEN', 'SYSTEM'] }).notNull(),
    note: text('note'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_events_order').on(t.orderId, t.at)],
)

/** One redemption per order; counting these enforces per-customer coupon limits. */
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    orderId: integer('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    couponCode: text('coupon_code')
      .notNull()
      .references(() => coupons.code),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
  },
  (t) => [index('coupon_redemptions_customer').on(t.couponCode, t.customerId)],
)

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id),
    provider: text('provider', { enum: ['RAZORPAY'] }).notNull(),
    providerOrderId: text('provider_order_id').notNull().unique(),
    providerPaymentId: text('provider_payment_id').unique(),
    amountPaise: money('amount_paise'),
    status: text('status', { enum: ['CREATED', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED'] }).notNull(),
    refundId: text('refund_id'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('payments_amount_positive', sql`${t.amountPaise} > 0`)],
)

/** Webhook deliveries already handled. Providers retry, so each event must apply once. */
export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- Tables and reservations -----------------------------------------------------------------

export const diningTables = pgTable(
  'dining_tables',
  {
    id: serial('id').primaryKey(),
    label: text('label').notNull().unique(),
    seats: integer('seats').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [check('dining_tables_seats', sql`${t.seats} between 1 and 20`)],
)

export const reservations = pgTable(
  'reservations',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    tableId: integer('table_id')
      .notNull()
      .references(() => diningTables.id),
    partySize: integer('party_size').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: text('status', { enum: ['BOOKED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] }).notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    check('reservations_window', sql`${t.endsAt} > ${t.startsAt}`),
    check('reservations_party', sql`${t.partySize} between 1 and 20`),
    index('reservations_start').on(t.startsAt),
    index('reservations_customer').on(t.customerId, t.startsAt),
  ],
)
