import 'server-only'
import { count } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  addonGroups,
  addons,
  categories,
  coupons,
  diningTables,
  itemVariants,
  menuItems,
  staff,
} from '@/db/schema'
import { hashPassword } from './auth/staff'

/**
 * The demo restaurant. Runs only when DEMO_SEED=true and the database has no staff, so it can
 * never touch real data.
 */

type SeedItem = {
  name: string
  description: string
  price?: number
  veg: boolean
  spice?: number
  bestseller?: boolean
  variants?: [string, number][]
  groups?: { name: string; min: number; max: number; options: [string, number][] }[]
}

const SPICE_CHOICE = {
  name: 'Spice level',
  min: 1,
  max: 1,
  options: [
    ['Mild', 0],
    ['Medium', 0],
    ['Hot', 0],
  ] as [string, number][],
}

const MENU: { name: string; items: SeedItem[] }[] = [
  {
    name: 'Starters',
    items: [
      {
        name: 'Paneer Tikka',
        description:
          'Cottage cheese, peppers and onion, marinated in spiced yoghurt and chargrilled in the tandoor.',
        price: 280,
        veg: true,
        spice: 1,
        bestseller: true,
      },
      {
        name: 'Hara Bhara Kebab',
        description: 'Spinach, green pea and potato patties with a crisp crust. Served with mint chutney.',
        price: 220,
        veg: true,
      },
      {
        name: 'Chicken Tikka',
        description: 'Boneless chicken thigh in a smoky red marinade, cooked over charcoal.',
        price: 320,
        veg: false,
        spice: 2,
        bestseller: true,
      },
      {
        name: 'Amritsari Fish',
        description: 'Basa fillet in a carom-seed batter, fried crisp and finished with chaat masala.',
        price: 360,
        veg: false,
        spice: 1,
      },
      {
        name: 'Masala Papad',
        description: 'Roasted papad topped with onion, tomato, coriander and lime.',
        price: 90,
        veg: true,
      },
    ],
  },
  {
    name: 'Mains',
    items: [
      {
        name: 'Dal Makhani',
        description: 'Black lentils simmered overnight with butter and cream. Our most ordered dish.',
        price: 260,
        veg: true,
        bestseller: true,
      },
      {
        name: 'Paneer Butter Masala',
        description: 'Paneer in a velvety tomato, cashew and fenugreek gravy.',
        price: 300,
        veg: true,
        spice: 1,
      },
      {
        name: 'Kadai Mushroom',
        description: 'Mushroom, capsicum and onion tossed with freshly pounded kadai spices.',
        price: 270,
        veg: true,
        spice: 2,
        groups: [SPICE_CHOICE],
      },
      {
        name: 'Butter Chicken',
        description: 'Tandoori chicken in the classic tomato-butter gravy, mild and rich.',
        price: 380,
        veg: false,
        spice: 1,
        bestseller: true,
        variants: [
          ['Half', 260],
          ['Full', 380],
        ],
      },
      {
        name: 'Mutton Rogan Josh',
        description: 'Kashmiri-style slow-cooked goat with Kashmiri chilli and fennel.',
        price: 460,
        veg: false,
        spice: 2,
        groups: [SPICE_CHOICE],
      },
      {
        name: 'Tadka Lane Thali',
        description:
          'Dal makhani, paneer of the day, seasonal sabzi, jeera rice, salad, raita, pickle and a dessert.',
        price: 340,
        veg: true,
        groups: [
          {
            name: 'Bread',
            min: 1,
            max: 1,
            options: [
              ['2 Tawa roti', 0],
              ['Butter naan', 30],
              ['Laccha paratha', 40],
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Biryani & Rice',
    items: [
      {
        name: 'Chicken Dum Biryani',
        description: 'Basmati and chicken layered with saffron and fried onion, sealed and slow-cooked.',
        veg: false,
        spice: 2,
        bestseller: true,
        variants: [
          ['Half', 240],
          ['Full', 380],
        ],
        groups: [
          {
            name: 'Extras',
            min: 0,
            max: 2,
            options: [
              ['Extra raita', 40],
              ['Boiled egg', 25],
              ['Mirchi salan', 30],
            ],
          },
        ],
      },
      {
        name: 'Veg Dum Biryani',
        description: 'Seasonal vegetables and basmati, cooked dum-style with whole spices.',
        veg: true,
        spice: 1,
        variants: [
          ['Half', 200],
          ['Full', 320],
        ],
        groups: [
          {
            name: 'Extras',
            min: 0,
            max: 2,
            options: [
              ['Extra raita', 40],
              ['Mirchi salan', 30],
            ],
          },
        ],
      },
      { name: 'Jeera Rice', description: 'Basmati tempered with cumin and ghee.', price: 160, veg: true },
      {
        name: 'Dal Khichdi',
        description: 'Comforting moong dal and rice with a ghee and garlic tadka.',
        price: 190,
        veg: true,
      },
    ],
  },
  {
    name: 'Breads',
    items: [
      {
        name: 'Butter Naan',
        description: 'Soft leavened bread from the tandoor, brushed with butter.',
        price: 60,
        veg: true,
      },
      { name: 'Garlic Naan', description: 'Naan with chopped garlic and coriander.', price: 75, veg: true },
      { name: 'Laccha Paratha', description: 'Flaky, layered whole-wheat paratha.', price: 70, veg: true },
      {
        name: 'Tandoori Roti',
        description: 'Whole-wheat flatbread from the clay oven.',
        price: 35,
        veg: true,
      },
    ],
  },
  {
    name: 'Desserts',
    items: [
      {
        name: 'Gulab Jamun',
        description: 'Two warm milk dumplings in cardamom syrup.',
        price: 110,
        veg: true,
      },
      {
        name: 'Rasmalai',
        description: 'Soft chenna discs in saffron-pistachio milk.',
        price: 140,
        veg: true,
      },
      {
        name: 'Gajar Halwa',
        description: 'Slow-cooked carrot pudding with khoya. Winter special.',
        price: 150,
        veg: true,
      },
    ],
  },
  {
    name: 'Drinks',
    items: [
      {
        name: 'Sweet Lassi',
        description: 'Thick churned yoghurt, lightly sweetened.',
        veg: true,
        variants: [
          ['Regular', 90],
          ['Large', 130],
        ],
      },
      {
        name: 'Masala Chaas',
        description: 'Spiced buttermilk with roasted cumin and mint.',
        price: 70,
        veg: true,
      },
      {
        name: 'Fresh Lime Soda',
        description: 'Sweet, salted or mixed.',
        price: 80,
        veg: true,
        groups: [
          {
            name: 'Style',
            min: 1,
            max: 1,
            options: [
              ['Sweet', 0],
              ['Salted', 0],
              ['Mixed', 0],
            ],
          },
        ],
      },
      {
        name: 'Masala Chai',
        description: 'Strong tea brewed with ginger and cardamom.',
        price: 50,
        veg: true,
      },
    ],
  },
]

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export async function seedDemo(db: Db, staffPassword: string, now = new Date()) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(staff)
  if (n > 0) return false

  const passwordHash = await hashPassword(staffPassword)
  await db.transaction(async (tx) => {
    await tx.insert(staff).values([
      { email: 'manager@tadkalane.example', name: 'Anita Rao', role: 'MANAGER', passwordHash },
      { email: 'kitchen@tadkalane.example', name: 'Kitchen', role: 'KITCHEN', passwordHash },
    ])

    for (const [ci, category] of MENU.entries()) {
      const [cat] = await tx
        .insert(categories)
        .values({ name: category.name, slug: slug(category.name), position: ci })
        .returning({ id: categories.id })
      for (const [ii, item] of category.items.entries()) {
        const [row] = await tx
          .insert(menuItems)
          .values({
            categoryId: cat!.id,
            name: item.name,
            slug: slug(item.name),
            description: item.description,
            pricePaise: (item.price ?? 0) * 100,
            veg: item.veg,
            spice: item.spice ?? 0,
            bestseller: item.bestseller ?? false,
            position: ii,
          })
          .returning({ id: menuItems.id })
        if (item.variants?.length) {
          await tx.insert(itemVariants).values(
            item.variants.map(([name, price], position) => ({
              itemId: row!.id,
              name,
              pricePaise: price * 100,
              position,
            })),
          )
        }
        for (const [gi, group] of (item.groups ?? []).entries()) {
          const [g] = await tx
            .insert(addonGroups)
            .values({
              itemId: row!.id,
              name: group.name,
              minSelect: group.min,
              maxSelect: group.max,
              position: gi,
            })
            .returning({ id: addonGroups.id })
          await tx.insert(addons).values(
            group.options.map(([name, price], position) => ({
              groupId: g!.id,
              name,
              pricePaise: price * 100,
              position,
            })),
          )
        }
      }
    }

    const year = now.getUTCFullYear()
    await tx.insert(coupons).values([
      {
        code: 'WELCOME50',
        description: '₹50 off your first order of ₹300 or more',
        kind: 'FLAT',
        value: 50_00,
        minOrderPaise: 300_00,
        startsAt: new Date(Date.UTC(year - 1, 0, 1)),
        endsAt: new Date(Date.UTC(year + 2, 0, 1)),
        firstOrderOnly: true,
        perCustomerLimit: 1,
      },
      {
        code: 'TADKA10',
        description: '10% off orders of ₹500 or more, up to ₹100',
        kind: 'PERCENT',
        value: 1000,
        minOrderPaise: 500_00,
        maxDiscountPaise: 100_00,
        startsAt: new Date(Date.UTC(year - 1, 0, 1)),
        endsAt: new Date(Date.UTC(year + 2, 0, 1)),
      },
    ])

    await tx.insert(diningTables).values([
      { label: 'T1', seats: 2 },
      { label: 'T2', seats: 2 },
      { label: 'T3', seats: 4 },
      { label: 'T4', seats: 4 },
      { label: 'T5', seats: 4 },
      { label: 'T6', seats: 6 },
      { label: 'T7', seats: 8 },
    ])
  })
  return true
}
