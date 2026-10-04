import 'server-only'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { env } from './env'
import { AppError } from './errors'

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Saves an uploaded dish photo as a 1200×900 WebP. Re-encoding through sharp means only real
 * image data is stored: whatever else the upload contained (scripts, metadata, GPS location
 * from a phone camera) does not survive.
 */
export async function saveMenuPhoto(file: File, itemId: number): Promise<string> {
  if (!ACCEPTED.has(file.type)) throw new AppError('BAD_IMAGE', 'Upload a JPEG, PNG or WebP photo.', 'photo')
  if (file.size > MAX_PHOTO_BYTES)
    throw new AppError('IMAGE_TOO_LARGE', 'Photos must be 5 MB or smaller.', 'photo')

  let output: Buffer
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate() // honour the phone's orientation flag before it is stripped
      .resize(1200, 900, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    throw new AppError('BAD_IMAGE', 'That file is not a photo we can read.', 'photo')
  }

  const name = `${itemId}-${randomBytes(6).toString('hex')}.webp`
  const dir = path.resolve(env().UPLOAD_DIR, 'menu')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), output)
  return `/media/menu/${name}`
}

export async function deleteMenuPhoto(publicPath: string | null) {
  const match = publicPath?.match(/^\/media\/menu\/([\w-]+\.webp)$/)
  if (!match) return
  await rm(path.resolve(env().UPLOAD_DIR, 'menu', match[1]!), { force: true })
}
