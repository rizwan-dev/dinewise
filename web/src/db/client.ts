import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Anything a query can run on: the pool or an open transaction. */
export type Executor = Db | Tx

// One pool per process. In development the module is re-evaluated on every edit, so the pool
// is kept on globalThis rather than leaking a new one each time.
const globalForDb = globalThis as unknown as { dinewisePool?: Pool; dinewiseDb?: Db }

export function pool(): Pool {
  globalForDb.dinewisePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    // A serverless instance can be frozen at any moment; don't keep idle connections open
    // across that.
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 10_000,
  })
  return globalForDb.dinewisePool
}

/** A direct connection string, for what a transaction pooler cannot carry (LISTEN, session locks). */
export function directDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
}

export function db(): Db {
  globalForDb.dinewiseDb ??= drizzle(pool(), { schema })
  return globalForDb.dinewiseDb
}

/** For tests: point the module at another pool. */
export function setDb(p: Pool): Db {
  globalForDb.dinewisePool = p
  globalForDb.dinewiseDb = drizzle(p, { schema })
  return globalForDb.dinewiseDb
}
