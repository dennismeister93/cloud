# Table Schemas

This directory contains Zod schemas that mirror the SQLite table definitions in [../persistence/migrations.ts](../../persistence/migrations.ts).

## Purpose

These schemas provide:

1. **Type-safe SQL query building** via `getTableFromZodSchema()` - table and column names are interpolated into SQL strings with compile-time safety
2. **Runtime validation** - `ZodSchema.parse(row)` validates query results and provides typed objects
3. **Partial schemas** for queries returning fewer columns (e.g., `RETURNING id`, `COUNT(*)`)

## Usage

```typescript
import { command_queue, QueuedCommandRecord } from '../db/tables/index.js';

const { columns: cols } = command_queue;

// INSERT - use cols.* for unqualified column names
sql.exec(
  `INSERT INTO ${command_queue} (${cols.session_id}, ${cols.execution_id}) VALUES (?, ?)`,
  sessionId,
  executionId
);

// SELECT/WHERE - use command_queue.* for qualified column names
const result = sql.exec(
  `SELECT ${command_queue.id} FROM ${command_queue} WHERE ${command_queue.session_id} = ?`,
  sessionId
);

// Parse and validate the result
const row = [...result][0];
const parsed = QueuedCommandRecord.pick({ id: true }).parse(row);
```

## ⚠️ Important: Keep in Sync with Migrations

When modifying table schemas in [../../persistence/migrations.ts](../../persistence/migrations.ts), you **must** update the corresponding Zod schema in this directory to keep them in sync. `ZodSchema.parse(row)` validates at runtime, so mismatches between the actual DB schema and the Zod schema will throw errors when queries are executed.
