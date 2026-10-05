import { db } from '@/db/client'
import { json, route } from '@/server/api/http'
import { activeOffers } from '@/server/offers'

export const dynamic = 'force-dynamic'

/** The coupons shown on the home page: the ones a customer could use right now. */
export const GET = route(async () => json({ offers: await activeOffers(db()) }))
