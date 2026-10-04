/**
 * Applies database migrations before `next build` on Vercel (`pnpm vercel-build`), so a cold
 * start never has to. Uses the direct connection: the migration lock is session-level, which a
 * transaction pooler cannot hold.
 *
 * Preview builds skip it: they share the production database, and a pull request's migration
 * must not reach it before the pull request is merged.
 */
import { Pool } from 'pg'
import { runMigrations } from '../src/db/migrate'

if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
  console.log(`Skipping migrations for a ${process.env.VERCEL_ENV} build.`)
  process.exit(0)
}

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const pool = new Pool({ connectionString, max: 1 })
try {
  await runMigrations(pool)
  console.log('Migrations applied.')
} finally {
  await pool.end()
}
