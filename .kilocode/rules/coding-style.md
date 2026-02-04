# Maintainability

- Prefer TS "type" to TS "interface"

- KISS: Be wary of over-abstracting code. Do report and ask about violations of DRY, but don't prematurely generalize.
- If trivial, avoid TS classes; use e.g. closures instead
- STRONGLY AVOID coding patterns that cannot be statically checked:
  - AVOID typescript's "as" operator
  - AVOID typescript's null-forgiving "!"
  - INSTEAD TRY where possible typescript's "satisfies", or leverage flow-sensitive typing.

- Prefer clear NAMES (for e.g. variables, functions and tests) over COMMENTS.
- ONLY add comments about things that are NOT OBVIOUS in context.
- Keep comments concise.
- DO update or remove comments that become outdated or unnecessary during your edits.
- REMOVE comments that aren't helpful to a future maintainer.
- NEVER automatically convert between snake_case and PascalCase or camelCase just to look conventional. If some external API has symbols in some unusual style, try to represent them exactly, so we can string-search for them with plain regexes. In general, respect form over function: when in conflict, prefer simple, non-clever code over code that merely looks nice.
- AVOID mocks; they make tests complex and brittle, assert on the result instead or check the db to observe
  a side effect. Where necessary refactor a dependency that really can't be tested indirectly into an explicit argument instead, and then pass a fake implementation if needed.
- Keep functions simple: if an argument is merely used to splat in a bunch of options in a return value an the caller can do that equally well, KISS and don't add an argument. Every function argument has a small cost; add them only where they meaningfully simplify the caller somehow.

# SQL Query Style (cloudflare-ai-attribution)

When writing SQL queries in the cloudflare-ai-attribution worker using the table query interpolator objects:

- NEVER use table aliases (e.g., `la`, `am`). Use the table interpolator object directly.
- Use `${table_name.column_name}` to reference columns with their table prefix (translates to `"table_name"."column_name"`).
- Use `${table_name.columns.column_name}` ONLY when you need the column name without the table prefix (translates to `"column_name"`).

Example:

```sql
-- GOOD: No aliases, direct table references
SELECT ${lines_added.line_hash}, ${lines_added.line_number}
FROM ${lines_added}
INNER JOIN ${attributions_metadata} ON ${lines_added.attributions_metadata_id} = ${attributions_metadata.id}
WHERE ${attributions_metadata.status} = 'accepted'

-- BAD: Using aliases
SELECT la.line_hash, la.line_number
FROM ${lines_added} la
INNER JOIN ${attributions_metadata} am ON la.attributions_metadata_id = am.id
```
