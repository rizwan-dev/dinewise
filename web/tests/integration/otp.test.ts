import { describe, expect, it } from 'vitest'
import { latestSms, OTP_MAX_ATTEMPTS, requestCode, verifyCode } from '../../src/server/auth/otp'
import { NOW, settle } from './helpers'
import { db } from './setup'

const SECRET = 'x'.repeat(32)
const deps = (now = NOW) => ({ exec: db, secret: SECRET, now })

async function codeSentTo(phone: string) {
  const sms = await latestSms(db, phone)
  return sms!.body.slice(0, 6)
}

describe('sign-in by one-time code', () => {
  it('signs in with the code sent to the phone, creating the customer once', async () => {
    const phone = await requestCode(deps(), '98220 11002', '10.0.0.1')
    expect(phone).toBe('+919822011002')

    const first = await verifyCode(deps(), phone, await codeSentTo(phone))
    expect(first.isNew).toBe(true)

    await requestCode(deps(), phone, '10.0.0.1')
    const again = await verifyCode(deps(), '+91 98220-11002', await codeSentTo(phone))
    expect(again).toEqual({ customerId: first.customerId, isNew: false })
  })

  it('works once: replaying a used code fails', async () => {
    const phone = await requestCode(deps(), '9822011002', null)
    const code = await codeSentTo(phone)
    await verifyCode(deps(), phone, code)
    await expect(verifyCode(deps(), phone, code)).rejects.toMatchObject({ code: 'CODE_EXPIRED' })
  })

  it('works once even when submitted twice at the same moment', async () => {
    const phone = await requestCode(deps(), '9822011002', null)
    const code = await codeSentTo(phone)
    const { ok, failed } = await settle([verifyCode(deps(), phone, code), verifyCode(deps(), phone, code)])
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
  })

  it('expires after five minutes', async () => {
    const phone = await requestCode(deps(), '9822011002', null)
    const code = await codeSentTo(phone)
    await expect(verifyCode(deps(new Date(NOW.getTime() + 5 * 60_000 + 1)), phone, code)).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
    })
  })

  it('locks the code after five wrong guesses, counting tries that run in parallel', async () => {
    const phone = await requestCode(deps(), '9822011002', null)
    const code = await codeSentTo(phone)
    const wrong = code === '000000' ? '111111' : '000000'

    const { failed } = await settle(Array.from({ length: 8 }, () => verifyCode(deps(), phone, wrong)))
    expect(failed.filter((f) => f.code === 'WRONG_CODE')).toHaveLength(OTP_MAX_ATTEMPTS)
    expect(failed.filter((f) => f.code === 'CODE_EXPIRED')).toHaveLength(8 - OTP_MAX_ATTEMPTS)
    // Even the right code no longer works.
    await expect(verifyCode(deps(), phone, code)).rejects.toMatchObject({ code: 'CODE_EXPIRED' })
  })

  it('tells the customer how many tries are left', async () => {
    const phone = await requestCode(deps(), '9822011002', null)
    const wrong = (await codeSentTo(phone)) === '000000' ? '111111' : '000000'
    await expect(verifyCode(deps(), phone, wrong)).rejects.toMatchObject({
      message: 'That code is not right. 4 tries left.',
    })
  })

  it('sends at most three codes to a phone in ten minutes, even when asked in parallel', async () => {
    const { ok, failed } = await settle(Array.from({ length: 6 }, () => requestCode(deps(), '9822011002', null)))
    expect(ok).toHaveLength(3)
    expect(failed.every((f) => f.code === 'TOO_MANY_CODES')).toBe(true)

    await expect(requestCode(deps(new Date(NOW.getTime() + 10 * 60_000 + 1)), '9822011002', null)).resolves.toBe(
      '+919822011002',
    )
  })

  it('limits codes from one network address across many phones', async () => {
    for (let i = 0; i < 10; i++) await requestCode(deps(), `98220110${String(i).padStart(2, '0')}`, '203.0.113.9')
    await expect(requestCode(deps(), '9822011099', '203.0.113.9')).rejects.toMatchObject({ code: 'TOO_MANY_CODES' })
  })

  it('only the newest code works', async () => {
    const phone = await requestCode(deps(), '9822011002', null)
    const old = await codeSentTo(phone)
    await requestCode(deps(), phone, null)
    const fresh = await codeSentTo(phone)
    if (old !== fresh) {
      await expect(verifyCode(deps(), phone, old)).rejects.toMatchObject({ code: 'WRONG_CODE' })
    }
    await expect(verifyCode(deps(), phone, fresh)).resolves.toBeDefined()
  })

  it('rejects numbers that are not Indian mobiles', async () => {
    for (const bad of ['12345', '5822011002', '+1 415 555 0100']) {
      await expect(requestCode(deps(), bad, null)).rejects.toMatchObject({ code: 'INVALID_PHONE' })
    }
  })
})
