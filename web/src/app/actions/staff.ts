'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/db/client'
import { menuItems, staff } from '@/db/schema'
import { parseRupees } from '@/domain/money'
import { ORDER_STATUSES } from '@/domain/order-status'
import { endSession, requireStaff, startSession } from '@/server/auth/current'
import { authenticateStaff } from '@/server/auth/staff'
import { env, serverless } from '@/server/env'
import { type ActionResult, AppError, toResult } from '@/server/errors'
import { setAvailability } from '@/server/menu'
import { move } from '@/server/orders'
import { deleteMenuPhoto, saveMenuPhoto } from '@/server/photos'
import { setReservationStatus } from '@/server/reservations'
import { deps } from '@/server/runtime'

export async function staffSignInAction(input: { email: string; password: string }): Promise<ActionResult> {
  const result = await toResult(async () => {
    const id = await authenticateStaff(db(), String(input.email), String(input.password))
    await startSession('STAFF', id)
  })
  if (!result.ok) return result
  redirect('/staff')
}

/**
 * One tap into the demo restaurant as its kitchen or its manager, so visitors can see the staff
 * side without typing the demo password. Refused unless this installation is the demo.
 */
export async function demoStaffSignInAction(role: 'KITCHEN' | 'MANAGER'): Promise<ActionResult> {
  const result = await toResult(async () => {
    if (!env().DEMO_SEED) throw new AppError('NOT_DEMO', 'Demo sign-in is only available in the demo.')
    const email = role === 'MANAGER' ? 'manager@tadkalane.example' : 'kitchen@tadkalane.example'
    const [member] = await db().select({ id: staff.id }).from(staff).where(eq(staff.email, email))
    if (!member) throw new AppError('NOT_FOUND', 'The demo staff accounts are not set up yet.')
    await startSession('STAFF', member.id)
  })
  if (!result.ok) return result
  redirect(role === 'MANAGER' ? '/staff/today' : '/staff')
}

export async function staffSignOutAction() {
  await endSession('STAFF')
  redirect('/staff/sign-in')
}

const moveSchema = z.object({
  orderId: z.number().int().positive(),
  to: z.enum(ORDER_STATUSES),
  note: z.string().max(200).optional(),
})

/** The kitchen's buttons. The state machine decides which moves are allowed. */
export async function moveOrderAction(input: z.input<typeof moveSchema>): Promise<ActionResult> {
  return toResult(async () => {
    await requireStaff('KITCHEN')
    const { orderId, to, note } = moveSchema.parse(input)
    const { db: database, gateway } = deps()
    await move(database, { orderId, to, actor: 'KITCHEN', note }, gateway)
  })
}

export async function setAvailabilityAction(itemId: number, available: boolean): Promise<ActionResult> {
  return toResult(async () => {
    await requireStaff('KITCHEN')
    if (!(await setAvailability(db(), itemId, available)))
      throw new AppError('NOT_FOUND', 'That dish no longer exists.')
    revalidatePath('/menu')
    revalidatePath('/staff/menu')
  })
}

const itemSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(80),
  description: z.string().trim().max(300),
  price: z.string(),
  bestseller: z.boolean(),
})

export async function updateItemAction(
  itemId: number,
  input: z.input<typeof itemSchema>,
): Promise<ActionResult> {
  return toResult(async () => {
    await requireStaff('MANAGER')
    const item = itemSchema.parse(input)
    const pricePaise = parseRupees(item.price)
    if (!Number.isFinite(pricePaise))
      throw new AppError('INVALID_PRICE', 'Enter a price such as 280 or 42.50.', 'price')
    await db()
      .update(menuItems)
      .set({
        name: item.name,
        description: item.description,
        pricePaise,
        bestseller: item.bestseller,
        updatedAt: new Date(),
      })
      .where(eq(menuItems.id, itemId))
    revalidatePath('/menu')
    revalidatePath('/staff/menu')
  })
}

export async function uploadPhotoAction(
  itemId: number,
  form: FormData,
): Promise<ActionResult<{ imagePath: string }>> {
  return toResult(async () => {
    await requireStaff('MANAGER')
    if (serverless()) throw new AppError('UPLOADS_OFF', 'Photo uploads are off in this hosted demo.')
    const file = form.get('photo')
    if (!(file instanceof File) || file.size === 0)
      throw new AppError('NO_FILE', 'Choose a photo first.', 'photo')
    const [item] = await db()
      .select({ imagePath: menuItems.imagePath })
      .from(menuItems)
      .where(eq(menuItems.id, itemId))
    if (!item) throw new AppError('NOT_FOUND', 'That dish no longer exists.')

    const imagePath = await saveMenuPhoto(file, itemId)
    await db().update(menuItems).set({ imagePath, updatedAt: new Date() }).where(eq(menuItems.id, itemId))
    await deleteMenuPhoto(item.imagePath)
    revalidatePath('/menu')
    revalidatePath('/staff/menu')
    return { imagePath }
  })
}

export async function reservationStatusAction(
  id: number,
  to: 'SEATED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED',
): Promise<ActionResult> {
  return toResult(async () => {
    await requireStaff('MANAGER')
    await setReservationStatus(db(), id, to)
    revalidatePath('/staff/reservations')
  })
}
