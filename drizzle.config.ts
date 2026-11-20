import { defineConfig } from 'drizzle-kit'

// The app runs on an in-process PGlite database that is rebuilt from
// server/database/ddl.ts on every boot, so there is no connection to push to.
// This config only drives `npm run db:generate`, which regenerates the baseline
// SQL from the Drizzle schema; `npm run db:ddl` turns that SQL into ddl.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schemas/index.ts',
  out: './server/database/migrations',
})
