import 'server-only'
import { asc, eq, inArray } from 'drizzle-orm'
import type { Executor } from '@/db/client'
import { addonGroups, addons, categories, itemVariants, menuItems } from '@/db/schema'
import type { MenuItem } from '@/domain/menu'

export type MenuEntry = MenuItem & {
  slug: string
  description: string
  spice: number
  bestseller: boolean
  imagePath: string | null
  categoryId: number
}

export type MenuSection = { id: number; name: string; slug: string; items: MenuEntry[] }

/** The whole menu in display order, in four queries rather than one per item. */
export async function loadMenu(exec: Executor): Promise<MenuSection[]> {
  const [cats, items] = await Promise.all([
    exec.select().from(categories).orderBy(asc(categories.position), asc(categories.id)),
    exec.select().from(menuItems).orderBy(asc(menuItems.position), asc(menuItems.id)),
  ])
  const ids = items.map((i) => i.id)
  const [variants, groups] = ids.length
    ? await Promise.all([
        exec
          .select()
          .from(itemVariants)
          .where(inArray(itemVariants.itemId, ids))
          .orderBy(asc(itemVariants.position), asc(itemVariants.id)),
        exec
          .select()
          .from(addonGroups)
          .where(inArray(addonGroups.itemId, ids))
          .orderBy(asc(addonGroups.position), asc(addonGroups.id)),
      ])
    : [[], []]
  const groupIds = groups.map((g) => g.id)
  const options = groupIds.length
    ? await exec
        .select()
        .from(addons)
        .where(inArray(addons.groupId, groupIds))
        .orderBy(asc(addons.position), asc(addons.id))
    : []

  const entries: MenuEntry[] = items.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    description: i.description,
    pricePaise: i.pricePaise,
    veg: i.veg,
    spice: i.spice,
    bestseller: i.bestseller,
    available: i.available,
    imagePath: i.imagePath,
    categoryId: i.categoryId,
    variants: variants
      .filter((v) => v.itemId === i.id)
      .map((v) => ({ id: v.id, name: v.name, pricePaise: v.pricePaise })),
    addonGroups: groups
      .filter((g) => g.itemId === i.id)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        addons: options
          .filter((a) => a.groupId === g.id)
          .map((a) => ({ id: a.id, name: a.name, pricePaise: a.pricePaise })),
      })),
  }))

  return cats
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      items: entries.filter((e) => e.categoryId === c.id),
    }))
    .filter((s) => s.items.length > 0)
}

export function menuById(sections: MenuSection[]): Map<number, MenuEntry> {
  return new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i]))
}

/** The lowest price a customer can pay for an item, for "from ₹220" labels. */
export function fromPrice(item: MenuItem): number {
  return item.variants.length ? Math.min(...item.variants.map((v) => v.pricePaise)) : item.pricePaise
}

export async function setAvailability(exec: Executor, itemId: number, available: boolean) {
  const [row] = await exec
    .update(menuItems)
    .set({ available, updatedAt: new Date() })
    .where(eq(menuItems.id, itemId))
    .returning({ id: menuItems.id })
  return Boolean(row)
}
