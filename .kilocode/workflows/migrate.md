# Migrations

- We use Drizzle ORM
- Database schema is defined in [`/src/db/schema.ts`](src/db/schema.ts)
- Migrations are stored in [`/src/db/migrations/`](src/db/migrations/)
- Configuration is in [`drizzle.config.ts`](drizzle.config.ts)
- To create a new migration follow these steps:
  1. First alter the schema in [`/src/db/schema.ts`](src/db/schema.ts) as appropriate
  2. Then run [`pnpm drizzle generate`](package.json:23) which will create a new migration file with a descriptive name
  3. Read the generated migration file in [`/src/db/migrations/`](src/db/migrations/)
  4. Improve the migration to ensure it is as NON-DESTRUCTIVE as possible and that Drizzle didn't change more than necessary
  5. If needed, you can run [`pnpm drizzle migrate`](package.json:23) to apply migrations to the database
  6. When you're done, run [`pnpm format`](package.json:12) to autoformat
- Prefer [`timestamp({ withTimezone: true })`](src/db/schema.ts:42) over regular timestamp columns for better timezone handling.
