/** The menu as the pricing rules see it: plain data, no database types. */

export type Variant = { id: number; name: string; pricePaise: number }

export type Addon = { id: number; name: string; pricePaise: number }

export type AddonGroup = {
  id: number
  name: string
  /** 0 makes the group optional; 1 with maxSelect 1 makes it "choose one". */
  minSelect: number
  maxSelect: number
  addons: Addon[]
}

export type MenuItem = {
  id: number
  name: string
  /** Used when the item has no variants. */
  pricePaise: number
  available: boolean
  veg: boolean
  variants: Variant[]
  addonGroups: AddonGroup[]
}
