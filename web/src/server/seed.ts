import 'server-only'
import { count, getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import type { Db } from '@/db/client'
import * as schema from '@/db/schema'
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
      {
        name: 'Veg Samosa',
        description: 'Two crisp pastries filled with spiced potato and peas, with tamarind and mint chutney.',
        price: 80,
        veg: true,
        spice: 1,
      },
      {
        name: 'Tandoori Chicken',
        description:
          'Bone-in chicken marinated overnight in yoghurt and Kashmiri chilli, roasted in the tandoor.',
        veg: false,
        spice: 2,
        bestseller: true,
        variants: [
          ['Half', 300],
          ['Full', 540],
        ],
      },
    ],
  },
  {
    name: 'Combos & Thalis',
    items: [
      {
        name: 'Tadka Lane Thali',
        description:
          'Dal makhani, paneer of the day, seasonal sabzi, jeera rice, salad, raita, pickle and a dessert.',
        price: 340,
        veg: true,
        bestseller: true,
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
      {
        name: 'Butter Chicken Combo',
        description: 'Butter chicken (half), two butter naan, jeera rice, salad and a gulab jamun.',
        price: 449,
        veg: false,
        spice: 1,
        bestseller: true,
      },
      {
        name: 'Paneer Combo',
        description: 'Paneer butter masala, dal makhani, two butter naan, jeera rice and salad.',
        price: 399,
        veg: true,
        spice: 1,
      },
      {
        name: 'Biryani Combo',
        description: 'Chicken dum biryani (half) with raita, mirchi salan, a boiled egg and a gulab jamun.',
        price: 349,
        veg: false,
        spice: 2,
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
        name: 'Palak Paneer',
        description: 'Paneer in a smooth spinach gravy finished with garlic tadka and a little cream.',
        price: 290,
        veg: true,
        spice: 1,
      },
      {
        name: 'Malai Kofta',
        description: 'Paneer and potato dumplings in a mild, creamy cashew gravy.',
        price: 310,
        veg: true,
      },
      {
        name: 'Rajma Chawal',
        description: 'Punjabi kidney-bean curry with steamed basmati, onion and lime. Sunday comfort.',
        price: 230,
        veg: true,
        spice: 1,
      },
      {
        name: 'Egg Curry',
        description: 'Two boiled eggs, lightly fried, in an onion-tomato masala.',
        price: 240,
        veg: false,
        spice: 2,
        groups: [SPICE_CHOICE],
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
    ],
  },
  {
    name: 'Street Favourites',
    items: [
      {
        name: 'Chole Bhature',
        description: 'Spicy Pindi chole with two fluffy bhature, pickled onion and green chilli.',
        price: 220,
        veg: true,
        spice: 2,
        bestseller: true,
      },
      {
        name: 'Pav Bhaji',
        description: 'Buttery mashed-vegetable bhaji with two toasted pav, onion and lime.',
        price: 190,
        veg: true,
        spice: 1,
        groups: [
          {
            name: 'Extras',
            min: 0,
            max: 2,
            options: [
              ['Extra pav', 30],
              ['Cheese on top', 40],
            ],
          },
        ],
      },
      {
        name: 'Aloo Paratha',
        description:
          'Two whole-wheat parathas stuffed with spiced potato, with white butter, curd and pickle.',
        price: 170,
        veg: true,
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
      {
        name: 'Kulfi',
        description: 'Dense, slow-reduced milk ice cream.',
        veg: true,
        variants: [
          ['Malai', 90],
          ['Kesar pista', 110],
        ],
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
        name: 'Mango Lassi',
        description: 'Alphonso mango pulp churned with yoghurt.',
        veg: true,
        bestseller: true,
        variants: [
          ['Regular', 120],
          ['Large', 160],
        ],
      },
      {
        name: 'Cold Coffee',
        description: 'Blended with milk and ice; add a scoop of vanilla ice cream if you like.',
        price: 140,
        veg: true,
        groups: [
          {
            name: 'Extras',
            min: 0,
            max: 1,
            options: [['Ice cream scoop', 40]],
          },
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

/** Dishes with a photo in public/menu (free Pexels and Wikimedia Commons photos; credits in the README). */
const PHOTOS = new Set([
  'aloo-paratha',
  'amritsari-fish',
  'biryani-combo',
  'butter-chicken',
  'butter-chicken-combo',
  'butter-naan',
  'chicken-dum-biryani',
  'chicken-tikka',
  'chole-bhature',
  'cold-coffee',
  'dal-khichdi',
  'dal-makhani',
  'egg-curry',
  'fresh-lime-soda',
  'gajar-halwa',
  'garlic-naan',
  'gulab-jamun',
  'hara-bhara-kebab',
  'jeera-rice',
  'kadai-mushroom',
  'kulfi',
  'laccha-paratha',
  'malai-kofta',
  'mango-lassi',
  'masala-chaas',
  'masala-chai',
  'masala-papad',
  'mutton-rogan-josh',
  'palak-paneer',
  'paneer-butter-masala',
  'paneer-combo',
  'paneer-tikka',
  'pav-bhaji',
  'rajma-chawal',
  'rasmalai',
  'sweet-lassi',
  'tadka-lane-thali',
  'tandoori-chicken',
  'tandoori-roti',
  'veg-dum-biryani',
  'veg-samosa',
])

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Empties every table and seeds the demo again. For a public demo only (DEMO_DAILY_RESET),
 * where anyone can sign in as the manager and change the menu.
 */
export async function resetDemo(db: Db, staffPassword: string, now = new Date()) {
  const tables = Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => `"${getTableName(table)}"`)
  await db.execute(sql.raw(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`))
  return seedDemo(db, staffPassword, now)
}

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
            imagePath: PHOTOS.has(slug(item.name)) ? `/menu/${slug(item.name)}.webp` : null,
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
