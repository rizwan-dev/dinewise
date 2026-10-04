/**
 * The restaurant's own rules. Kept in code, not the database: they change rarely, a change
 * deserves a review, and every rule here is covered by a test.
 *
 * "Tadka Lane" is a fictional restaurant used for the demo.
 */
export const RESTAURANT = {
  name: 'Tadka Lane',
  tagline: 'North Indian home-style cooking, Baner, Pune',
  phone: '+91 20 0000 0000',
  email: 'hello@tadkalane.example',
  address: {
    street: 'Demo Road, Baner',
    city: 'Pune',
    region: 'Maharashtra',
    postalCode: '411045',
    country: 'IN',
  },
  timeZone: 'Asia/Kolkata',

  /** Opening hours in the restaurant's local time, per weekday (0 = Sunday). */
  hours: {
    0: { open: '11:00', close: '23:00' },
    1: { open: '11:30', close: '22:30' },
    2: { open: '11:30', close: '22:30' },
    3: { open: '11:30', close: '22:30' },
    4: { open: '11:30', close: '22:30' },
    5: { open: '11:30', close: '23:00' },
    6: { open: '11:00', close: '23:00' },
  } as Record<number, { open: string; close: string }>,

  ordering: {
    /** Orders are planned in slots of this length; each slot has a kitchen capacity. */
    slotMinutes: 15,
    /** The most orders the kitchen will take for any one slot. */
    ordersPerSlot: 8,
    /** How long the kitchen needs before the first slot an order can be ready in. */
    prepMinutes: 30,
    /** How far ahead customers may schedule. */
    scheduleDaysAhead: 2,
    minimumOrderPaise: 200_00,
    /** Unpaid online orders are released after this long. */
    paymentWindowMinutes: 20,
  },

  delivery: {
    /** Delivery is offered to these pincodes only, with a fee each. */
    pincodes: {
      '411045': 30_00,
      '411021': 40_00,
      '411007': 40_00,
      '411008': 50_00,
    } as Record<string, number>,
    /** Orders at or above this subtotal deliver free. */
    freeAbovePaise: 800_00,
  },

  /** Packing charge per order, so takeaway packaging is not hidden in item prices. */
  packagingPaise: 20_00,

  /**
   * Restaurant service in India is taxed at 5% GST without input tax credit, and delivery and
   * packing by the restaurant itself are part of the same supply, so the whole bill is taxed
   * at 5%, half CGST and half SGST.
   */
  gstBasisPoints: 500,

  reservations: {
    /** A table is held for this long per booking. */
    durationMinutes: 90,
    slotMinutes: 30,
    maxPartySize: 10,
    daysAhead: 14,
    /** Bookings stop this long before closing. */
    lastSeatingBeforeCloseMinutes: 90,
  },
} as const

export type RestaurantConfig = typeof RESTAURANT
