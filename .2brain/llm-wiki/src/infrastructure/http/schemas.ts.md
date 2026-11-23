---
source: src/infrastructure/http/schemas.ts
source_sha256: b74b2e759be6ea5cad02eb260757e7dfd8461b82ae145d374a3201a616591ff1
context_sha256: 02c58efeb23406b6fa2b438fa25c10245934995fc3437017aeb4d1c459636d1d
generated_at: 2026-11-22T02:54:07.689154+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/schemas.ts

## Purpose
Shared Zod schemas for contract scalars that more than one endpoint accepts as HTTP input (pagination, hard-delete flag, booleans, locale, trimmed text). `readInput` decodes a transport but does not validate, so these schemas are written once here instead of being re-derived per controller. Bounds are declared locally rather than imported from the orval-generated client, and `tests/cross-cutting/contract-scalars.test.ts` checks they match the generated constants.

## Key elements
- `blankToUndefined(value)` — maps `''`, `null` and `undefined` to `undefined`, so an untouched form field counts as absent rather than causing a 422.
- `trimmedInto(field)` — trims a string first, then pipes it into the generated field schema. A whitespace-only value therefore fails the contract's `minLength: 1`, and no bounds are restated.
- `wellFormedLocale(field)` — adds a `.refine` that the tag is well-formed BCP 47 (via `isWellFormedLocale`). Works on optional or nullable fields; absent and `null` pass.
- `hardDeleteSchema` — boolean that defaults to `false` (soft delete) when absent or blank.
- `pageSchema` — coerced integer, 1 to `PAGE_MAX` (10,000), optional.
- `pageSizeSchema` — coerced integer, 1 to `PAGE_SIZE_MAX` (100), optional.
- `paginationSchema` — `z.strictObject` of `page` and `pageSize`. Unknown keys give a 422.
- `optionalBooleanSchema` — decodes string spellings with `parseFormBoolean`, then validates as an optional boolean. It has no default.
- Private constants: `PAGE_SIZE_MAX`, `PAGE_MAX`, `HARD_DELETE_DEFAULT`.

## Relationships
- Imports `parseFormBoolean` from `src/infrastructure/http/request.ts`. `optionalBooleanSchema` uses it to decode text booleans.
- Imports `isWellFormedLocale` from `src/infrastructure/i18n` (index.ts). `wellFormedLocale` uses it. `locale-tag.ts` is a related i18n neighbor.
- Used by controllers and services in the neighbor list: account, api-keys, audit-logs, delivery, example, inventory, plus `create-delete-controller.ts` in surfaces and `title-rule.ts`. They draw on these shared scalars for pagination, delete mode, boolean, locale and trimmed-text inputs. Which scalar each one uses is not visible here.

## Notes
- The delete flag is read as a value, never as presence. `?hardDelete=false` must stay soft, because the string `'false'` is truthy.
- `pageSchema` and `pageSizeSchema` do not default. `normalizePagination` in `@infrastructure/persistence/search` is the only place defaults are set.
- The page bounds cap the deepest Mongo `skip` at about 1,000,000 documents.
- The constants are duplicated from `openapi.yaml` on purpose. Importing orval's per-operation constants would pull a domain name into `infrastructure`.
- `hardDeleteSchema` and `pageSchema` are `z.preprocess` schemas, not plain Zod types. Anything unrecognised fails validation and is not guessed at.
