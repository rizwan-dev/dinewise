import type { Metadata } from 'next'
import { CartLoader } from './cart-loader'

export const metadata: Metadata = { title: 'Your cart', robots: { index: false } }

export default function CartPage() {
  return <CartLoader />
}
