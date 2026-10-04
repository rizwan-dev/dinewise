import { formatPaise } from '@/domain/money'
import type { Totals } from '@/domain/pricing'

/** The bill, the same everywhere it appears: cart, checkout, order page and the kitchen. */
export function Bill({ totals, couponCode }: { totals: Totals; couponCode?: string | null }) {
  const rows: [string, number, string?][] = [
    ['Item total', totals.subtotalPaise],
    ...(totals.discountPaise
      ? [
          [`Discount${couponCode ? ` (${couponCode})` : ''}`, -totals.discountPaise, 'text-leaf-700'] as [
            string,
            number,
            string,
          ],
        ]
      : []),
    ['Packing', totals.packagingPaise],
    ...(totals.deliveryFeePaise ? [['Delivery', totals.deliveryFeePaise] as [string, number]] : []),
    ['GST (5%)', totals.taxPaise],
  ]
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([label, amount, tone]) => (
        <div key={label} className="flex justify-between">
          <dt className="text-stone-600">{label}</dt>
          <dd className={`tabular-nums ${tone ?? ''}`}>
            {amount < 0 ? '−' : ''}
            {formatPaise(Math.abs(amount))}
          </dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold">
        <dt>To pay</dt>
        <dd className="tabular-nums">{formatPaise(totals.totalPaise)}</dd>
      </div>
    </dl>
  )
}
