# Dinewise mobile API (v1)

The JSON API that the Dinewise mobile app uses, in two modes: **customer** (browse, price a cart,
sign in by one-time code, order, follow the order live) and **kitchen** (staff sign-in, the
kitchen board, moving orders on, sold out, live updates).

This document is the contract. Every request and response below was produced by the running
server; the integration tests in [`web/tests/integration/api-*.test.ts`](../web/tests/integration)
hold the API to it.

The API calls the same server code as the website. A quote here is the bill the web cart shows,
an order placed here passes the same checks as the web checkout, and a kitchen move here obeys
the same state machine as the kitchen screen.

## Contents

- [Conventions](#conventions)
- [Authentication](#authentication)
- [Errors](#errors)
- [Reference values](#reference-values)
- Customer: [restaurant](#get-apiv1restaurant) · [menu](#get-apiv1menu) ·
  [offers](#get-apiv1offers) · [slots](#get-apiv1slots) · [quote](#post-apiv1quote) ·
  [send code](#post-apiv1authotp) · [verify code](#post-apiv1authotpverify) ·
  [sign out](#post-apiv1authsign-out) · [me](#get-apiv1me) · [place order](#post-apiv1orders) ·
  [my orders](#get-apiv1orders) · [one order](#get-apiv1orderscode) ·
  [cancel](#post-apiv1orderscodecancel) · [order events](#get-apiv1orderscodeevents)
- Kitchen: [sign in](#post-apiv1staffsign-in) · [demo sign in](#post-apiv1staffdemo-sign-in) ·
  [sign out](#post-apiv1staffsign-out) · [me](#get-apiv1staffme) ·
  [board](#get-apiv1kitchenboard) · [move](#post-apiv1kitchenorderscodemove) ·
  [sold out](#post-apiv1kitchenmenuitemidavailability) · [kitchen events](#get-apiv1kitchenevents)
- [Live updates (Server-Sent Events)](#live-updates-server-sent-events)
- [Demo-only behaviour](#demo-only-behaviour)
- [Notes for the app](#notes-for-the-app)

## Conventions

| Topic         | Rule                                                                                                                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL      | `https://dinewise.riztechacademy.com/api/v1` (the public demo), or `http://localhost:8082/api/v1` for `docker compose up`. From the Android emulator the local stack is `http://10.0.2.2:8082/api/v1`.                                                |
| Version       | The path carries the version. Within v1, fields may be **added** to responses and new endpoints may appear; nothing is removed or renamed. Ignore fields you do not know.                                                                             |
| Format        | Request and response bodies are JSON (`Content-Type: application/json`, UTF-8). `204` responses have no body. Every response carries `Cache-Control: no-store`.                                                                                       |
| Money         | Whole **paise** as integers (`28000` is ₹280.00), in fields ending `Paise`. Responses that carry money also carry `"currency": "INR"`. Never do arithmetic in floating-point rupees; show `paise / 100` formatted for `en-IN`.                        |
| Time          | Instants are ISO 8601 in UTC, e.g. `2026-10-05T07:30:00.000Z`. Show them in the restaurant's zone (`timeZone`, `Asia/Kolkata`), not the phone's. Opening hours are `HH:mm` wall-clock times in that zone; slot `date`s are `YYYY-MM-DD` in that zone. |
| Ids and codes | Menu ids (`itemId`, `variantId`, addon `id`) are integers and stable while a dish exists. Orders are identified by their public **code**, `TL-` and six characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (e.g. `TL-8X2H84`).                         |
| Null          | A field that can be empty is present with `null`, not omitted (the one exception: `demoCode`, see [demo-only behaviour](#demo-only-behaviour)).                                                                                                       |
| CORS          | None: the API is for native apps. Browsers on other origins cannot call it.                                                                                                                                                                           |

## Authentication

Two kinds of signed-in user, each with its own **access token**:

| Kind     | How to get one                                                                                   | Lifetime | Accepted by                                               |
| -------- | ------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------- |
| Customer | [`POST /auth/otp`](#post-apiv1authotp), then [`POST /auth/otp/verify`](#post-apiv1authotpverify) | 30 days  | `/me`, `/orders…`, `/auth/sign-out`; optional on `/quote` |
| Staff    | [`POST /staff/sign-in`](#post-apiv1staffsign-in) (or the demo's one-tap sign-in)                 | 12 hours | `/staff/me`, `/staff/sign-out`, `/kitchen/…`              |

Send the token on every call that needs it:

```http
Authorization: Bearer GjNB92Y4Sj85JdfXUdoJzfd8ElycB_-YMTBQJuMLX8k
```

- The token is opaque: 43 URL-safe characters today, but treat it as an opaque string of up to 200. Store it in secure storage (Keychain / Android Keystore via `flutter_secure_storage`).
- `expiresAt` in the sign-in response says when it stops working. There is no refresh token: when
  it expires, sign in again.
- A customer token is never accepted where a staff token is needed, and the other way round; the
  wrong kind is the same as no token (`401 UNAUTHENTICATED`).
- `401 UNAUTHENTICATED` on any endpoint other than the sign-in ones means the token is missing,
  expired, revoked, or (staff) the account has been switched off. Drop the token and go to sign-in.
- Signing out revokes the token on the server at once.
- On the server, only a SHA-256 hash of each token is stored (in the same `sessions` table as the
  website's cookies), and expired tokens are purged by the regular housekeeping.

Roles: staff are `KITCHEN` or `MANAGER`. Every kitchen endpoint is open to both (a manager can do
everything the kitchen can). A role that is not allowed gets `403 FORBIDDEN`; no v1 endpoint is
manager-only today.

## Errors

Every failure has the same shape:

```json
{
  "error": {
    "code": "WRONG_CODE",
    "message": "That code is not right. 4 tries left.",
    "field": "code"
  }
}
```

- `code` is stable: switch on it.
- `message` is written for the person using the app, in plain English. Show it as it is.
- `field` is present when one input is at fault, so the app can put the message next to it.
  For a nested input it is the last part of the path (`pincode` for `newAddress.pincode`), except
  for `VALIDATION_FAILED`, where it is the full dotted path (`lines.0.quantity`).

| Status | Meaning                                                                | Codes                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | The request itself is malformed                                        | `INVALID_JSON`, `VALIDATION_FAILED` (wrong type, missing field, value out of range), `INVALID` (a checkout field: `name`, `pincode`, `line1`…), `INVALID_PHONE`, `INVALID_CODE` (not six digits)                                                                                                                                                                                                                                                                 |
| 401    | Not signed in, or wrong sign-in details                                | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` (staff email/password)                                                                                                                                                                                                                                                                                                                                                                                                  |
| 403    | Signed in, but not allowed                                             | `FORBIDDEN`, `NOT_DEMO` (demo-only endpoint on a real installation)                                                                                                                                                                                                                                                                                                                                                                                              |
| 404    | Not found, or not yours                                                | `NOT_FOUND`, `ORDER_NOT_FOUND`, `ADDRESS_NOT_FOUND`                                                                                                                                                                                                                                                                                                                                                                                                              |
| 409    | The world moved on: refresh and try again                              | `INVALID_TRANSITION` (order already moved, or cannot be cancelled now), `SLOT_FULL` (that time has just filled up), `SLOT_UNAVAILABLE` (that time is no longer offered), `KITCHEN_FULL` (no ASAP slot left)                                                                                                                                                                                                                                                      |
| 422    | Understood, but a business rule says no                                | Cart: `EMPTY_CART`, `UNKNOWN_ITEM`, `UNAVAILABLE`, `BAD_QUANTITY`, `CHOOSE_VARIANT`, `UNKNOWN_VARIANT`, `UNKNOWN_ADDON`, `ADDON_LIMIT`, `MINIMUM_ORDER`, `NO_DELIVERY`. Coupon: `COUPON_NOT_FOUND`, `COUPON_INACTIVE`, `COUPON_NOT_STARTED`, `COUPON_EXPIRED`, `COUPON_FIRST_ORDER_ONLY`, `COUPON_USED_UP`, `COUPON_MIN_ORDER`. Checkout: `ADDRESS_REQUIRED`, `ONLINE_PAYMENT_NOT_SUPPORTED`. Sign-in: `WRONG_CODE`, `CODE_EXPIRED`. Kitchen: `REASON_REQUIRED`. |
| 429    | Too many attempts                                                      | `TOO_MANY_CODES`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 500    | A bug on our side; the details are in the server log, not the response | `INTERNAL`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Treat an unknown code by its status. New codes may be added within v1.

## Reference values

**Order status** and what the customer sees (`statusLabel`):

| `status`           | `statusLabel`         | Meaning                                                     |
| ------------------ | --------------------- | ----------------------------------------------------------- |
| `AWAITING_PAYMENT` | Waiting for payment   | Web online payments only; never for app orders              |
| `PLACED`           | Order received        | On the kitchen's New column. The customer can still cancel. |
| `PREPARING`        | Being prepared        | Cooking                                                     |
| `READY`            | Ready                 | Cooked; waiting for the rider, or at the counter for pickup |
| `OUT_FOR_DELIVERY` | On the way            | Delivery only                                               |
| `DELIVERED`        | Delivered             | Final (delivery)                                            |
| `COLLECTED`        | Collected             | Final (pickup)                                              |
| `CANCELLED`        | Cancelled             | Final; by the customer before cooking started               |
| `REJECTED`         | Could not be accepted | Final; by the kitchen, with `rejectReason`                  |
| `EXPIRED`          | Payment not completed | Final; web online payment never completed                   |

The flow (the kitchen moves an order one step at a time; `kitchenNext` names the step):

```
PLACED ──► PREPARING ──► READY ──► OUT_FOR_DELIVERY ──► DELIVERED   (delivery)
                           └─────► COLLECTED                         (pickup)
PLACED ──► CANCELLED   by the customer
PLACED or PREPARING ──► REJECTED   by the kitchen, reason required
```

**Kitchen action labels** (`kitchenNextLabel`): `PREPARING` "Start cooking", `READY` "Mark
ready", `OUT_FOR_DELIVERY` "Out for delivery", `DELIVERED` "Delivered", `COLLECTED` "Collected".

**`paymentMethod`**: `ON_DELIVERY` (cash: on delivery, or at pickup) or `ONLINE` (web only).
**`paymentStatus`**: `NOT_REQUIRED` (cash), `PENDING`, `PAID`, `REFUND_PENDING`, `REFUNDED`.
**`fulfilment`**: `DELIVERY` or `PICKUP`. **Timeline `actor`**: `CUSTOMER`, `KITCHEN` or `SYSTEM`.

---

## Customer endpoints

### `GET /api/v1/restaurant`

No authentication. Everything the app needs to render the restaurant and explain each charge.

```json
{
  "name": "Tadka Lane",
  "tagline": "North Indian home-style cooking, Baner, Pune",
  "phone": "+91 20 0000 0000",
  "email": "hello@tadkalane.example",
  "address": {
    "street": "Demo Road, Baner",
    "city": "Pune",
    "region": "Maharashtra",
    "postalCode": "411045",
    "country": "IN"
  },
  "timeZone": "Asia/Kolkata",
  "hours": [
    { "weekday": 0, "day": "Sunday", "open": "11:00", "close": "23:00" },
    { "weekday": 1, "day": "Monday", "open": "11:30", "close": "22:30" },
    { "weekday": 2, "day": "Tuesday", "open": "11:30", "close": "22:30" },
    { "weekday": 3, "day": "Wednesday", "open": "11:30", "close": "22:30" },
    { "weekday": 4, "day": "Thursday", "open": "11:30", "close": "22:30" },
    { "weekday": 5, "day": "Friday", "open": "11:30", "close": "23:00" },
    { "weekday": 6, "day": "Saturday", "open": "11:00", "close": "23:00" }
  ],
  "openNow": true,
  "nextReadyAt": "2026-10-05T07:30:00.000Z",
  "serverTime": "2026-10-05T06:53:14.192Z",
  "currency": "INR",
  "ordering": {
    "fulfilment": ["DELIVERY", "PICKUP"],
    "paymentMethods": ["ON_DELIVERY"],
    "slotMinutes": 15,
    "ordersPerSlot": 8,
    "prepMinutes": 30,
    "scheduleDaysAhead": 2,
    "minimumOrderPaise": 20000,
    "maxQuantityPerLine": 20,
    "maxLines": 30
  },
  "charges": {
    "packagingPaise": 2000,
    "gstBasisPoints": 500,
    "gstNote": "GST is charged at 5% on the whole bill after any discount, including packing and delivery: half CGST, half SGST.",
    "delivery": {
      "freeAbovePaise": 80000,
      "pincodes": [
        { "pincode": "411007", "feePaise": 4000 },
        { "pincode": "411008", "feePaise": 5000 },
        { "pincode": "411021", "feePaise": 4000 },
        { "pincode": "411045", "feePaise": 3000 }
      ]
    }
  },
  "demo": true
}
```

- `hours[i].open` / `close` are `null` on a day the restaurant is closed (none today).
- `openNow` is whether the kitchen is open at `serverTime`. `nextReadyAt` is the "as soon as
  possible" time (the first slot with room), or `null` when every slot in the scheduling window is
  full. Orders can be scheduled while the restaurant is closed.
- `gstBasisPoints` is hundredths of a percent (`500` = 5%).
- Delivery is only to the listed pincodes. The fee is waived when the item total (before
  discount) is at least `freeAbovePaise`. The minimum order applies to the item total too.
- `demo` is true on the public demo; see [demo-only behaviour](#demo-only-behaviour).

### `GET /api/v1/menu`

No authentication. Sections in display order, each with its dishes in display order. Sold-out
dishes are included with `available: false` (show them greyed out; they cannot be ordered).
Sections with no dishes are left out.

```json
{
  "currency": "INR",
  "sections": [
    {
      "id": 1,
      "name": "Starters",
      "slug": "starters",
      "items": [
        {
          "id": 1,
          "slug": "paneer-tikka",
          "name": "Paneer Tikka",
          "description": "Cottage cheese, peppers and onion, marinated in spiced yoghurt and chargrilled in the tandoor.",
          "pricePaise": 28000,
          "fromPricePaise": 28000,
          "veg": true,
          "spice": 1,
          "bestseller": true,
          "available": true,
          "photoUrl": "http://localhost:8082/menu/paneer-tikka.webp",
          "variants": [],
          "addonGroups": []
        }
      ]
    }
  ]
}
```

A dish with sizes and one with a required choice (from the same response):

```json
{
  "id": 19,
  "slug": "butter-chicken",
  "name": "Butter Chicken",
  "pricePaise": 38000,
  "fromPricePaise": 26000,
  "veg": false,
  "spice": 1,
  "variants": [
    { "id": 3, "name": "Half", "pricePaise": 26000 },
    { "id": 4, "name": "Full", "pricePaise": 38000 }
  ],
  "addonGroups": []
}
```

```json
{
  "id": 18,
  "name": "Kadai Mushroom",
  "pricePaise": 27000,
  "variants": [],
  "addonGroups": [
    {
      "id": 3,
      "name": "Spice level",
      "minSelect": 1,
      "maxSelect": 1,
      "addons": [
        { "id": 7, "name": "Mild", "pricePaise": 0 },
        { "id": 8, "name": "Medium", "pricePaise": 0 },
        { "id": 9, "name": "Hot", "pricePaise": 0 }
      ]
    }
  ]
}
```

How to use it, as the web's dish sheet does:

- **`variants`** (sizes such as Half/Full): when the list is not empty the customer must choose
  exactly one, and its `pricePaise` replaces the dish's `pricePaise`. Pre-select the first.
  `fromPricePaise` is the lowest price, for "from ₹260" labels.
- **`addonGroups`** (extras and choices): pick between `minSelect` and `maxSelect` addons from
  each group. `minSelect 1, maxSelect 1` is "choose one" (pre-select the first addon);
  `minSelect 0` is optional, "up to `maxSelect`". Each chosen addon adds its `pricePaise`.
- Unit price = (variant or dish price) + chosen addons. The server re-prices everything on
  [`/quote`](#post-apiv1quote) and at checkout; the app's own sum is only for the "Add ₹…" button.
- **`photoUrl`** is absolute, on the host the app called (a proxy's `X-Forwarded-Host` /
  `X-Forwarded-Proto` are honoured), or `null` when the dish has no photo: show a placeholder.
  Photos are WebP, about 1200×900, and never change at a URL (a new photo gets a new URL), so
  they can be cached indefinitely.
- `spice` is 0 (not spicy) to 3. `veg` drives the green/red veg mark.

### `GET /api/v1/offers`

No authentication. The coupons a customer could use right now (the home page's offers strip),
lowest minimum order first. The code is applied in the cart (`couponCode` on `/quote` and
`/orders`); whether it applies to this customer and cart is decided there.

```json
{
  "offers": [
    {
      "code": "WELCOME50",
      "description": "₹50 off your first order of ₹300 or more",
      "firstOrderOnly": true
    },
    {
      "code": "TADKA10",
      "description": "10% off orders of ₹500 or more, up to ₹100",
      "firstOrderOnly": false
    }
  ]
}
```

### `GET /api/v1/slots`

No authentication. When an order can be ready: "as soon as possible" plus every 15-minute slot
from now + prep time to closing, over today and the next `scheduleDaysAhead` days. The same
object is part of every [`/quote`](#post-apiv1quote) response; call this one to refresh the
picker after a `SLOT_FULL` error.

```json
{
  "asap": "2026-10-05T07:30:00.000Z",
  "slots": [
    {
      "value": "2026-10-05T07:30:00.000Z",
      "date": "2026-10-05",
      "startsAt": "2026-10-05T07:30:00.000Z",
      "full": false
    },
    {
      "value": "2026-10-05T07:45:00.000Z",
      "date": "2026-10-05",
      "startsAt": "2026-10-05T07:45:00.000Z",
      "full": false
    }
  ]
}
```

- `asap` is the time an "as soon as possible" order would be ready by now, or `null` if nothing
  has room (then only scheduling is possible, and only if a slot is not `full`).
- `value` is what to send as `slot` when placing a scheduled order. `date` is the restaurant's
  local date, for grouping the picker by day ("Today", "Tomorrow", "Wed, 7 Oct").
- A `full` slot cannot be chosen; show it disabled.

### `POST /api/v1/quote`

Authentication **optional**. Prices a cart exactly as the web cart and checkout do. Send the
customer token when there is one: coupon rules that depend on the customer (first order only,
uses per customer) are then checked for them. Without it, a coupon is checked as if for a first
order, and checked properly when the order is placed.

Request:

| Field        | Type                      | Notes                                                          |
| ------------ | ------------------------- | -------------------------------------------------------------- |
| `lines`      | array, up to 30           | `{ itemId, variantId?, addonIds?, quantity }`; `quantity` 1–20 |
| `fulfilment` | `"DELIVERY"`/`"PICKUP"`   |                                                                |
| `pincode`    | string, 6 digits, or null | Needed for `DELIVERY`                                          |
| `couponCode` | string or null, ≤ 30      | Case and spaces do not matter (`welcome 50` = `WELCOME50`)     |

```json
{
  "lines": [
    { "itemId": 19, "variantId": 4, "quantity": 1 },
    { "itemId": 18, "addonIds": [9], "quantity": 1 },
    { "itemId": 29, "quantity": 2 }
  ],
  "fulfilment": "DELIVERY",
  "pincode": "411021",
  "couponCode": "WELCOME50"
}
```

Response `200` (always 200 for a well-formed request, even when the cart cannot be ordered):

```json
{
  "currency": "INR",
  "ok": true,
  "problem": null,
  "coupon": { "applied": true, "code": "WELCOME50", "problem": null },
  "lines": [
    {
      "itemId": 19,
      "name": "Butter Chicken",
      "variantId": 4,
      "variantName": "Full",
      "addons": [],
      "quantity": 1,
      "unitPricePaise": 38000,
      "lineTotalPaise": 38000
    },
    {
      "itemId": 18,
      "name": "Kadai Mushroom",
      "variantId": null,
      "variantName": null,
      "addons": [{ "id": 9, "name": "Hot", "pricePaise": 0 }],
      "quantity": 1,
      "unitPricePaise": 27000,
      "lineTotalPaise": 27000
    },
    {
      "itemId": 29,
      "name": "Garlic Naan",
      "variantId": null,
      "variantName": null,
      "addons": [],
      "quantity": 2,
      "unitPricePaise": 7500,
      "lineTotalPaise": 15000
    }
  ],
  "totals": {
    "subtotalPaise": 80000,
    "discountPaise": 5000,
    "packagingPaise": 2000,
    "deliveryFeePaise": 0,
    "taxPaise": 3850,
    "totalPaise": 80850
  },
  "slots": {
    "asap": "2026-10-05T07:30:00.000Z",
    "slots": [
      {
        "value": "2026-10-05T07:30:00.000Z",
        "date": "2026-10-05",
        "startsAt": "2026-10-05T07:30:00.000Z",
        "full": false
      }
    ]
  }
}
```

The bill, in the order the web shows it: **Item total** `subtotalPaise`; **Discount (CODE)**
`−discountPaise` (row hidden when 0); **Packing** `packagingPaise`; **Delivery**
`deliveryFeePaise` (row hidden when 0); **GST (5%)** `taxPaise`; **To pay** `totalPaise`.
`total = subtotal − discount + packing + delivery + tax`, and `tax` is 5% of everything before
it, rounded half up to the paisa. Delivery above shows 0 because the item total reached the
free-delivery threshold.

When the cart cannot be ordered as it is, `ok` is false, `totals` is null, `lines` is empty and
`problem` says why (the same codes as the [422 cart errors](#errors)):

```json
{
  "currency": "INR",
  "ok": false,
  "problem": { "code": "UNAVAILABLE", "message": "Garlic Naan is sold out right now." },
  "coupon": { "applied": false, "code": null, "problem": null },
  "lines": [],
  "totals": null,
  "slots": { "asap": "2026-10-05T07:30:00.000Z", "slots": [] }
}
```

When the coupon does not apply, the cart is priced **without** it and `coupon.problem` says why;
show the message under the coupon field:

```json
"coupon": {
  "applied": false,
  "code": null,
  "problem": { "code": "COUPON_FIRST_ORDER_ONLY", "message": "WELCOME50 is for your first order only." }
}
```

`coupon` is `{ "applied": false, "code": null, "problem": null }` when no code was sent.

### `POST /api/v1/auth/otp`

No authentication. Sends a one-time sign-in code by SMS to an Indian mobile number.

```json
{ "phone": "98220 22314" }
```

`phone` may be written with spaces, dashes, `+91`, `91` or a leading `0`. Response `200`:

```json
{ "phone": "+919822022314", "expiresInSeconds": 300 }
```

`phone` is the number normalised to E.164: send it (or the original) to `/auth/otp/verify`. On
the public demo the response also has `"demoCode": "645104"`; see
[demo-only behaviour](#demo-only-behaviour).

Rules (the web's): a code lasts 5 minutes and works once; a new code replaces the previous one;
at most **3 codes per phone per 10 minutes** and 10 per network per hour (`429 TOO_MANY_CODES`).
Errors: `400 INVALID_PHONE` (`field: "phone"`), `429 TOO_MANY_CODES`.

### `POST /api/v1/auth/otp/verify`

No authentication. Checks the code and returns a customer token. The first successful sign-in
for a phone creates the customer.

| Field   | Type                   | Notes                                                           |
| ------- | ---------------------- | --------------------------------------------------------------- |
| `phone` | string                 | As sent to `/auth/otp`                                          |
| `code`  | string                 | Six digits; spaces are ignored                                  |
| `name`  | string, 2–60, optional | Saves the customer's name (also settable when placing an order) |

```json
{ "phone": "9822022314", "code": "645104", "name": "Asha Kulkarni" }
```

Response `200`:

```json
{
  "accessToken": "GjNB92Y4Sj85JdfXUdoJzfd8ElycB_-YMTBQJuMLX8k",
  "tokenType": "Bearer",
  "expiresAt": "2026-11-04T06:53:14.375Z",
  "isNewCustomer": true,
  "customer": { "id": 25, "phone": "+919822022314", "name": "Asha Kulkarni" }
}
```

`customer.name` is `null` until the customer gives one; ask for it when `isNewCustomer` is true
or the name is null.

Errors (all with `field: "code"` except the phone one):

| Status | Code            | When                                                                                       |
| ------ | --------------- | ------------------------------------------------------------------------------------------ |
| 400    | `INVALID_PHONE` | Not an Indian mobile number                                                                |
| 400    | `INVALID_CODE`  | Not six digits                                                                             |
| 422    | `WRONG_CODE`    | Wrong code. The message counts down ("4 tries left"); after 5 wrong tries the code is dead |
| 422    | `CODE_EXPIRED`  | No live code for this phone: expired, used, replaced or locked. Ask for a new one          |

### `POST /api/v1/auth/sign-out`

Customer token. Revokes it. Response `204` with no body. A missing or already-revoked token is
`401 UNAUTHENTICATED` (the app can treat that as signed out too).

### `GET /api/v1/me`

Customer token. The customer and their saved delivery addresses (oldest first).

```json
{
  "customer": { "id": 25, "phone": "+919822022314", "name": "Asha Kulkarni" },
  "addresses": [
    {
      "id": 12,
      "label": "Home",
      "line1": "Flat 7, Aundh Road",
      "line2": null,
      "landmark": "Near the park",
      "pincode": "411021"
    }
  ]
}
```

### `POST /api/v1/orders`

Customer token. Places an order through the web checkout: the same validation, kitchen-slot
capacity (a slot never takes more than 8 orders, even when many people check out at once),
coupon rules (checked again, for this customer, under a lock) and prices (worked out again from
the current menu). **Cash only in v1**: on delivery, or at pickup.

| Field           | Type                      | Notes                                                                                                                                   |
| --------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `lines`         | array, 1–30               | As for `/quote`                                                                                                                         |
| `fulfilment`    | `"DELIVERY"`/`"PICKUP"`   |                                                                                                                                         |
| `slot`          | string                    | `"ASAP"`, or a slot `value` from `/slots` or `/quote` for a scheduled order                                                             |
| `name`          | string 2–60, optional     | Saved as the customer's name. Required if the customer has no name yet (`400 INVALID`, `field: "name"`)                                 |
| `addressId`     | integer, optional         | DELIVERY: one of the customer's saved addresses (`/me`)                                                                                 |
| `newAddress`    | object, optional          | DELIVERY, instead of `addressId`: `{ label? (default "Home", ≤30), line1 (3–120), line2? (≤120), landmark? (≤80), pincode (6 digits) }` |
| `saveAddress`   | boolean, optional         | Keep `newAddress` for next time (saved only if the order succeeds)                                                                      |
| `paymentMethod` | `"ON_DELIVERY"`, optional | The default. `"ONLINE"` is refused with `422 ONLINE_PAYMENT_NOT_SUPPORTED`                                                              |
| `couponCode`    | string or null, optional  | As for `/quote`. Here a coupon that does not apply is an **error**, not silently dropped                                                |
| `notes`         | string ≤ 300, optional    | For the kitchen ("Less oil please")                                                                                                     |

```json
{
  "lines": [
    { "itemId": 19, "variantId": 4, "quantity": 1 },
    { "itemId": 18, "addonIds": [9], "quantity": 1 },
    { "itemId": 29, "quantity": 2 }
  ],
  "fulfilment": "DELIVERY",
  "slot": "ASAP",
  "paymentMethod": "ON_DELIVERY",
  "newAddress": {
    "label": "Home",
    "line1": "Flat 7, Aundh Road",
    "landmark": "Near the park",
    "pincode": "411021"
  },
  "saveAddress": true,
  "couponCode": "WELCOME50",
  "notes": "Less oil please"
}
```

Response `201`, with `Location: /api/v1/orders/TL-8X2H84`. The body is the
[order](#get-apiv1orderscode), as `{ "order": { … } }`.

Errors to handle:

| Status | Code                                                              | What the app should do                           |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------ |
| 400    | `INVALID` with `field`                                            | Show the message next to that field              |
| 404    | `ADDRESS_NOT_FOUND` (`field: "address"`)                          | Refresh addresses from `/me`                     |
| 409    | `SLOT_FULL`, `SLOT_UNAVAILABLE`, `KITCHEN_FULL` (`field: "slot"`) | Refresh `/slots`, ask the customer to pick again |
| 422    | `ADDRESS_REQUIRED`                                                | Ask for an address                               |
| 422    | Cart codes (`UNAVAILABLE`, `MINIMUM_ORDER`, `NO_DELIVERY`…)       | Re-quote and show the problem                    |
| 422    | Coupon codes (`COUPON_…`)                                         | Remove the coupon or let the customer change it  |
| 422    | `ONLINE_PAYMENT_NOT_SUPPORTED` (`field: "paymentMethod"`)         | Only offer cash                                  |

Placing the same order twice places two orders: disable the button while the request is in
flight.

### `GET /api/v1/orders`

Customer token. The customer's 50 most recent orders, newest first. Online orders whose payment
was never completed are left out.

```json
{
  "currency": "INR",
  "orders": [
    {
      "code": "TL-8X2H84",
      "status": "PLACED",
      "statusLabel": "Order received",
      "final": false,
      "fulfilment": "DELIVERY",
      "totalPaise": 80850,
      "readyBy": "2026-10-05T07:30:00.000Z",
      "createdAt": "2026-10-05T06:53:14.448Z"
    }
  ]
}
```

### `GET /api/v1/orders/{code}`

Customer token. One of the customer's own orders: what the web order page shows. Another
customer's order, or a code that does not exist, is `404 ORDER_NOT_FOUND`.

```json
{
  "order": {
    "code": "TL-8X2H84",
    "status": "PREPARING",
    "statusLabel": "Being prepared",
    "final": false,
    "fulfilment": "DELIVERY",
    "paymentMethod": "ON_DELIVERY",
    "paymentStatus": "NOT_REQUIRED",
    "readyBy": "2026-10-05T07:30:00.000Z",
    "scheduled": false,
    "createdAt": "2026-10-05T06:53:14.448Z",
    "updatedAt": "2026-10-05T06:53:16.183Z",
    "canCancel": false,
    "steps": [
      { "status": "PLACED", "label": "Order received", "done": true, "current": false },
      { "status": "PREPARING", "label": "Being prepared", "done": false, "current": true },
      { "status": "READY", "label": "Ready", "done": false, "current": false },
      { "status": "OUT_FOR_DELIVERY", "label": "On the way", "done": false, "current": false },
      { "status": "DELIVERED", "label": "Delivered", "done": false, "current": false }
    ],
    "rejectReason": null,
    "customerName": "Asha Kulkarni",
    "customerPhone": "+919822022314",
    "address": {
      "label": "Home",
      "line1": "Flat 7, Aundh Road",
      "line2": null,
      "pincode": "411021",
      "landmark": "Near the park"
    },
    "notes": "Less oil please",
    "currency": "INR",
    "items": [
      {
        "id": 163,
        "itemId": 19,
        "name": "Butter Chicken",
        "variantName": "Full",
        "addons": [],
        "quantity": 1,
        "unitPricePaise": 38000,
        "lineTotalPaise": 38000
      },
      {
        "id": 164,
        "itemId": 18,
        "name": "Kadai Mushroom",
        "variantName": null,
        "addons": [{ "id": 9, "name": "Hot", "pricePaise": 0 }],
        "quantity": 1,
        "unitPricePaise": 27000,
        "lineTotalPaise": 27000
      },
      {
        "id": 165,
        "itemId": 29,
        "name": "Garlic Naan",
        "variantName": null,
        "addons": [],
        "quantity": 2,
        "unitPricePaise": 7500,
        "lineTotalPaise": 15000
      }
    ],
    "couponCode": "WELCOME50",
    "totals": {
      "subtotalPaise": 80000,
      "discountPaise": 5000,
      "packagingPaise": 2000,
      "deliveryFeePaise": 0,
      "taxPaise": 3850,
      "totalPaise": 80850
    },
    "cashDuePaise": 80850,
    "timeline": [
      {
        "status": "PLACED",
        "label": "Order received",
        "actor": "CUSTOMER",
        "note": null,
        "at": "2026-10-05T06:53:14.448Z"
      },
      {
        "status": "PREPARING",
        "label": "Being prepared",
        "actor": "KITCHEN",
        "note": null,
        "at": "2026-10-05T06:53:16.183Z"
      }
    ]
  }
}
```

| Field            | Meaning                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readyBy`        | The slot the order is due in: "Expected at your door around …" (delivery) or "Ready for pickup around …" (pickup). Show it while the order is not final.                    |
| `scheduled`      | The customer chose a time (`slot` was not `"ASAP"`)                                                                                                                         |
| `final`          | No more changes will come: stop listening for events                                                                                                                        |
| `canCancel`      | Show a Cancel button ([cancel](#post-apiv1orderscodecancel))                                                                                                                |
| `steps`          | The progress bar for this fulfilment: tick `done` steps, highlight `current`. Empty for `CANCELLED`, `REJECTED`, `EXPIRED` and `AWAITING_PAYMENT` (show a message instead). |
| `rejectReason`   | For `REJECTED`: "The restaurant could not accept this order: {rejectReason}."                                                                                               |
| `address`        | The delivery address as it was when ordered; `null` for pickup (show the restaurant's address from `/restaurant`)                                                           |
| `items[].itemId` | The dish, or `null` if it has since been removed from the menu. `addons` are the addons chosen, with the prices paid                                                        |
| `cashDuePaise`   | "Please keep ₹… ready in cash": set while a cash order is open, `null` once final                                                                                           |
| `timeline`       | Every change, oldest first. `note` carries the rejection reason or a system note                                                                                            |

### `POST /api/v1/orders/{code}/cancel`

Customer token. Cancels the customer's order, allowed while it is `PLACED` (`canCancel`).
No body. Response `200` with the updated `{ "order": { … } }` (`status: "CANCELLED"`).
Errors: `404 ORDER_NOT_FOUND`; `409 INVALID_TRANSITION` with "The kitchen has started on this
order, so it can no longer be cancelled."

### `GET /api/v1/orders/{code}/events`

Customer token. Live changes to one of the customer's own orders as
[Server-Sent Events](#live-updates-server-sent-events). `401` / `404 ORDER_NOT_FOUND` are
returned as JSON errors before any stream starts.

---

## Kitchen endpoints

### `POST /api/v1/staff/sign-in`

No authentication. Email (case and surrounding spaces ignored) and password to a staff token
that lasts 12 hours (a shift).

```json
{ "email": "kitchen@tadkalane.example", "password": "tadka-demo-2026" }
```

```json
{
  "accessToken": "l1UIGIZK2BUaapLgCMbQLLvG2RDRlStcjWeIqnT_rwA",
  "tokenType": "Bearer",
  "expiresAt": "2026-10-05T18:53:14.535Z",
  "staff": { "id": 2, "name": "Kitchen", "email": "kitchen@tadkalane.example", "role": "KITCHEN" }
}
```

A wrong email, wrong password or switched-off account all give the same
`401 INVALID_CREDENTIALS` "Email or password is incorrect."

### `POST /api/v1/staff/demo-sign-in`

No authentication. **Demo only**: the web's "Try as kitchen" / "Try as manager" buttons.

```json
{ "role": "MANAGER" }
```

`role` is `KITCHEN` or `MANAGER`. The response is the same as `/staff/sign-in`. On a real
installation it is `403 NOT_DEMO`; show the buttons only when `/restaurant` says `demo: true`.

### `POST /api/v1/staff/sign-out`

Staff token. Revokes it. `204`, no body.

### `GET /api/v1/staff/me`

Staff token.

```json
{ "staff": { "id": 2, "name": "Kitchen", "email": "kitchen@tadkalane.example", "role": "KITCHEN" } }
```

### `GET /api/v1/kitchen/board`

Staff token (`KITCHEN` or `MANAGER`). The tickets the web kitchen screen shows: every order that
is `PLACED`, `PREPARING`, `READY` or `OUT_FOR_DELIVERY`, oldest due time first. `current` holds the
live columns; `later` holds orders scheduled more than an hour ahead (the web's "Scheduled for
later"), which join `current` as their time approaches. Group `current` into the web's columns
by `status`: New (`PLACED`), Cooking (`PREPARING`), Ready (`READY`), Out (`OUT_FOR_DELIVERY`).

```json
{
  "serverTime": "2026-10-05T06:53:16.116Z",
  "currency": "INR",
  "rejectReasons": ["Item out of stock", "Kitchen too busy", "Outside delivery area", "Closing soon"],
  "current": [
    {
      "code": "TL-YD2P39",
      "status": "READY",
      "fulfilment": "DELIVERY",
      "customerName": "Aditya Deshpande",
      "dueAt": "2026-10-05T07:00:00.000Z",
      "placedAt": "2026-10-05T06:27:35.419Z",
      "later": false,
      "late": false,
      "paidOnline": false,
      "totalPaise": 76650,
      "cashToCollectPaise": 76650,
      "notes": null,
      "pincode": "411007",
      "items": [
        { "id": 159, "quantity": 1, "name": "Malai Kofta", "details": "" },
        { "id": 160, "quantity": 1, "name": "Amritsari Fish", "details": "" }
      ],
      "kitchenNext": "OUT_FOR_DELIVERY",
      "kitchenNextLabel": "Out for delivery",
      "canReject": false
    }
  ],
  "later": []
}
```

| Field                | Meaning                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dueAt`              | When the order must be ready ("Due 1:00 pm")                                                                                                                  |
| `late`               | Past `dueAt` and not yet ready, at `serverTime`. Recompute on the device as time passes: `now > dueAt` and status is `PLACED` or `PREPARING`, and not `later` |
| `items[].details`    | Size and extras joined with " · " ("Full · Extra butter"), or empty                                                                                           |
| `cashToCollectPaise` | "Collect ₹… cash" for cash orders; `null` when paid online ("Paid online")                                                                                    |
| `pincode`            | Delivery pincode; `null` for pickup                                                                                                                           |
| `kitchenNext`        | The one big button: the status to send to [move](#post-apiv1kitchenorderscodemove), labelled `kitchenNextLabel`. `null` when there is no next step            |
| `canReject`          | Show Reject (allowed while `PLACED` or `PREPARING`); offer `rejectReasons` as one-tap reasons                                                                 |

### `POST /api/v1/kitchen/orders/{code}/move`

Staff token (`KITCHEN` or `MANAGER`). Moves an order on, as the kitchen screen's buttons do.
The target status is explicit, so a retried request cannot skip a step: repeating a move that
already happened is `409`.

```json
{ "to": "PREPARING" }
```

```json
{ "to": "REJECTED", "reason": "Kitchen too busy" }
```

| Field    | Type                   | Notes                                              |
| -------- | ---------------------- | -------------------------------------------------- |
| `to`     | order status           | Normally the ticket's `kitchenNext`, or `REJECTED` |
| `reason` | string ≤ 200, optional | Required for `REJECTED`; the customer sees it      |

Response `200`, the order's new state and next step:

```json
{
  "code": "TL-8X2H84",
  "status": "PREPARING",
  "statusLabel": "Being prepared",
  "kitchenNext": "READY",
  "kitchenNextLabel": "Mark ready",
  "canReject": true
}
```

Errors: `404 ORDER_NOT_FOUND`; `409 INVALID_TRANSITION` "This order has already moved on.
Refresh to see its current state." (refresh the board); `422 REASON_REQUIRED` (`field: "note"`)
for a rejection without a reason; `400 VALIDATION_FAILED` for an unknown status. A paid web
order that is rejected is refunded automatically.

### `POST /api/v1/kitchen/menu/{itemId}/availability`

Staff token (`KITCHEN` or `MANAGER`). Marks a dish sold out, or back on. It leaves (or returns
to) the menu at once, on the web and in the app; carts holding it get `UNAVAILABLE` on the next
quote.

```json
{ "available": false }
```

```json
{ "itemId": 29, "available": false }
```

Errors: `404 NOT_FOUND` for an unknown dish; `400 VALIDATION_FAILED` when `available` is not a
boolean. To list dishes and their current availability, use [`GET /menu`](#get-apiv1menu).

### `GET /api/v1/kitchen/events`

Staff token (`KITCHEN` or `MANAGER`). Every order change, for the kitchen board, as
[Server-Sent Events](#live-updates-server-sent-events).

---

## Live updates (Server-Sent Events)

`GET /api/v1/orders/{code}/events` (customer) and `GET /api/v1/kitchen/events` (staff) hold the
connection open and send a line-based `text/event-stream`. Send the bearer token in the
`Authorization` header, and `Accept: text/event-stream`. Changes come from the database when
each change commits, so they are the same whichever server instance the app reaches.

A stream looks like this (each message ends with a blank line):

```
retry: 3000

event: order
data: {"id":75,"code":"TL-8X2H84","status":"PREPARING","paymentStatus":"NOT_REQUIRED"}

: keep-alive

event: order
data: {"id":75,"code":"TL-8X2H84","status":"READY","paymentStatus":"NOT_REQUIRED"}

event: resync
data: {}
```

| Message         | Meaning                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retry: 3000`   | Sent first, once the server is listening. Reconnect 3 seconds after the stream drops                                                                                                                                      |
| `event: order`  | An order was created, or its `status` or `paymentStatus` changed. `data` is `{ id, code, status, paymentStatus }` (`id` is internal; use `code`). The kitchen stream carries every order; the customer stream only theirs |
| `event: resync` | The server lost its database listener for a moment and may have missed changes: fetch again                                                                                                                               |
| `: keep-alive`  | A comment every 20 seconds so proxies keep the connection open. Ignore it                                                                                                                                                 |

The events say _something changed_; the REST endpoints stay the source of truth. On every
`order` or `resync` event, fetch the order (`GET /orders/{code}`) or the board
(`GET /kitchen/board`) again. The `status` in the event is enough to update a badge at once.

**Reconnecting.** The server ends every stream after about **4½ minutes** (the hosting's
function time limit), and networks drop. When the stream ends for any reason:

1. wait 3 seconds (the `retry` value; back off up to ~30 seconds if it keeps failing),
2. reconnect, and
3. **fetch the order or board again**, because changes made while disconnected are not replayed.

Also fetch again when the app returns to the foreground, and close the stream while it is in the
background (as the web does when its tab is hidden). Stop listening to an order once it is
`final`. A `401` on reconnect means the token has expired: sign in again.

Flutter has no built-in EventSource: read the response of a streamed `http` request
(`http.Client().send()` with `StreamedResponse`) line by line, collecting `event:` and `data:`
lines until a blank line, and skipping lines that start with `:`.

## Demo-only behaviour

On the public demo (`/restaurant` says `"demo": true`; the server runs with `DEMO_SEED=true`),
and never on a real installation:

- **`POST /auth/otp` returns the code** as `demoCode`, because the demo sends no SMS. The app can
  offer a "Fill it in" button like the website. On a real installation the field is absent and
  the code arrives only by SMS.
- **`POST /staff/demo-sign-in`** signs in as the demo kitchen or manager with one tap.
- The kitchen board **tops itself up** with simulated customers' orders so it never looks empty,
  and the demo is reset from time to time (orders, customers and sign-ins included): expect
  tokens and orders to disappear after a reset, and handle `401` / `404` by signing in again.
- Demo staff: `kitchen@tadkalane.example` and `manager@tadkalane.example`, password
  `tadka-demo-2026`. Coupons: `WELCOME50` (first order) and `TADKA10`. Delivery pincodes:
  411045, 411021, 411007, 411008.

## Notes for the app

- **Cash only in v1.** Show "Cash on delivery" for delivery and "Pay at pickup" for pickup; do not
  send `ONLINE`. Online payment exists on the website (Razorpay) and will need its own endpoints.
- **The server decides every price.** Re-quote whenever the cart, fulfilment, pincode or coupon
  changes, and show the server's totals. The order placed is priced again at that moment, so its
  `totals` can differ from an old quote if the menu changed in between.
- **Photos** are absolute URLs on the host the app called; cache them by URL.
- **Times**: format with the restaurant's zone (`Asia/Kolkata`) whatever the phone's zone is.
- **Rate limits** on codes are per phone and per network; show the `429` message as it is.
- **Not in v1**: table bookings, reorder, editing or deleting saved addresses, editing dishes and
  photos, sales and the manager's Today dashboard. They remain on the website.
