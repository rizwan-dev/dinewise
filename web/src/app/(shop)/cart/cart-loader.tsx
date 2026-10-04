'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '@/components/skeleton'

/**
 * The cart lives in this browser's storage, which the server cannot see. Rendering it on the
 * server would show "Your cart is empty" for a moment before the items appeared, so it is
 * rendered in the browser only, with a skeleton meanwhile.
 */
export const CartLoader = dynamic(() => import('./cart-view').then((m) => m.CartView), {
  ssr: false,
  loading: PageSkeleton,
})
