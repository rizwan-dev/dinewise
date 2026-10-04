/**
 * Turns downloaded dish photos into the WebP files the demo ships with.
 *
 *   node scripts/prepare-photos.mjs <folder of slug.jpg files>
 *
 * Each becomes public/menu/<slug>.webp at 1200×900 (4:3, cropped to the most interesting part),
 * and hero.jpg becomes public/hero.webp at 1600×900. Metadata is stripped.
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/prepare-photos.mjs <folder>')

const outDir = path.resolve('public/menu')
for (const file of (await readdir(source)).filter((f) => f.endsWith('.jpg'))) {
  const slug = path.basename(file, '.jpg')
  const hero = slug === 'hero'
  const target = hero ? path.resolve('public/hero.webp') : path.join(outDir, `${slug}.webp`)
  const info = await sharp(path.join(source, file))
    .rotate()
    .resize(hero ? 1600 : 1200, 900, { fit: 'cover', position: 'attention' })
    .webp({ quality: hero ? 75 : 72 })
    .toFile(target)
  console.log(`${path.relative(process.cwd(), target).padEnd(40)} ${Math.round(info.size / 1024)} KB`)
}
