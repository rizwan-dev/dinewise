'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '@/components/skeleton'

/** Browser-only for the same reason as the cart: the cart is in this browser's storage. */
export const CheckoutLoader = dynamic(() => import('./checkout-form').then((m) => m.CheckoutForm), {
  ssr: false,
  loading: PageSkeleton,
})
