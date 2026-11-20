import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { DDL } from './ddl'
import * as schema from './schemas/index'
import { seed, seedCustomers } from './seed'

export type Database = PgliteDatabase<typeof schema>

declare global {
  var __db__: Database | undefined
}

/**
 * This is the public demo build: it has no database to connect to. Postgres runs
 * in-process instead, compiled to WASM by PGlite, so every query in the app is
 * still real SQL against a real Postgres — there is just no server, no
 * connection string and no credential anywhere.
 *
 * The database starts empty on every cold boot, so it gets the schema from
 * ddl.ts and the dataset from server/database/seed.ts. Nothing is persisted:
 * writes made in the demo live as long as the server instance does.
 */
async function bootstrap(client: PGlite, db: Database) {
  const started = Date.now()
  await client.exec(DDL)
  await seed(db)
  await seedCustomers(db)
  console.log(`🗃️  Demo database ready in ${Date.now() - started}ms`)
}

/**
 * PGlite queues queries until the WASM instance has booted, so a handle is
 * usable the moment it is constructed. The schema and the seed are not covered
 * by that queue though, so the handle the app gets waits on them first —
 * otherwise a request landing mid-cold-start would read an empty database.
 */
function gated(client: PGlite, ready: Promise<void>): PGlite {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value
      if (prop !== 'query' && prop !== 'transaction') return value.bind(target)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return async (...args: any[]) => {
        await ready
        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  })
}

export const getDb = (): Database => {
  if (globalThis.__db__) return globalThis.__db__

  const client = new PGlite()
  const config = { schema, casing: 'snake_case' } as const
  const ready = bootstrap(client, drizzle({ client, ...config }))

  const db = drizzle({ client: gated(client, ready), ...config })
  globalThis.__db__ = db
  return db
}
