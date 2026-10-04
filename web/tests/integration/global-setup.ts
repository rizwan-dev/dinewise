import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import type { TestProject } from 'vitest/node'
import { runMigrations } from '../../src/db/migrate'

let container: StartedPostgreSqlContainer

/** One PostgreSQL for the whole run, migrated exactly as production is. */
export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  const url = container.getConnectionUri()
  const pool = new Pool({ connectionString: url })
  await runMigrations(pool)
  await pool.end()
  project.provide('databaseUrl', url)
}

export async function teardown() {
  await container?.stop()
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}
