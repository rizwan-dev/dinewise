import { describe, expect, it } from 'vitest'
import { isValidCheckoutSignature, isValidWebhookSignature } from './razorpay'

// Expected values computed independently with `openssl dgst -sha256 -hmac`, so these tests
// check the algorithm Razorpay specifies rather than our code against itself.
const CHECKOUT_SIGNATURE = 'a45158a5b113a9dd546d71be2201778742a628bf90f8eccb77a1cf1be4ec32c9'
const WEBHOOK_BODY = '{"event":"payment.captured","payload":{}}'
const WEBHOOK_SIGNATURE = '09873f612c535c8d3b2de754fd0befb1c0efac0ffcbea2c60de522e3d4ba045c'

describe('Razorpay signatures', () => {
  it('accepts the Checkout signature over "order_id|payment_id"', () => {
    expect(
      isValidCheckoutSignature('test_key_secret', 'order_RZtest123', 'pay_RZtest456', CHECKOUT_SIGNATURE),
    ).toBe(true)
  })

  it('rejects a signature for a different payment, secret, or a malformed value', () => {
    expect(
      isValidCheckoutSignature('test_key_secret', 'order_RZtest123', 'pay_other', CHECKOUT_SIGNATURE),
    ).toBe(false)
    expect(
      isValidCheckoutSignature('wrong_secret', 'order_RZtest123', 'pay_RZtest456', CHECKOUT_SIGNATURE),
    ).toBe(false)
    expect(isValidCheckoutSignature('test_key_secret', 'order_RZtest123', 'pay_RZtest456', 'not-hex')).toBe(
      false,
    )
    expect(isValidCheckoutSignature('test_key_secret', 'order_RZtest123', 'pay_RZtest456', '')).toBe(false)
  })

  it('checks webhooks against the exact raw body, so re-serialised JSON fails', () => {
    expect(isValidWebhookSignature('whsec_test', WEBHOOK_BODY, WEBHOOK_SIGNATURE)).toBe(true)
    expect(
      isValidWebhookSignature(
        'whsec_test',
        JSON.stringify(JSON.parse(WEBHOOK_BODY), null, 2),
        WEBHOOK_SIGNATURE,
      ),
    ).toBe(false)
  })
})
