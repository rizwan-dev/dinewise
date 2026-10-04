import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Anything a query can run on: the pool or an open transaction. */
export type Executor = Db | Tx

// One pool per process. In development the module is re-evaluated on every edit, so the pool
// is kept on globalThis rather than leaking a new one each time.
const globalForDb = globalThis as unknown as { tadkaPool?: Pool; tadkaDb?: Db }

export function pool(): Pool {
  globalForDb.tadkaPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  })
  return globalForDb.tadkaPool
}

export function db(): Db {
  globalForDb.tadkaDb ??= drizzle(pool(), { schema })
  return globalForDb.tadkaDb
}

/** For tests: point the module at another pool. */
export function useDb(p: Pool): Db {
  globalForDb.tadkaPool = p
  globalForDb.tadkaDb = drizzle(p, { schema })
  return globalForDb.tadkaDb
}
