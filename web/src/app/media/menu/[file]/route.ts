import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '@/server/env'

/**
 * Uploaded dish photos. File names are random and never reused, so a photo can be cached
 * forever; a new upload gets a new name.
 */
export async function GET(_request: Request, ctx: RouteContext<'/media/menu/[file]'>) {
  const { file } = await ctx.params
  // Only names this app generates: no path separators, no traversal.
  if (!/^\d+-[0-9a-f]{12}\.webp$/.test(file)) return new Response('Not found', { status: 404 })
  try {
    const body = await readFile(path.resolve(env().UPLOAD_DIR, 'menu', file))
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
