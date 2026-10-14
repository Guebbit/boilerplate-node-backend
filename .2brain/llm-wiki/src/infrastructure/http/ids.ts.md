---
source: src/infrastructure/http/ids.ts
sha256: 2c27f8bf65225373047938c1f93c4d94294efb73d426cb763fe1af41b95d7e0c
generated_at: 2026-10-14T07:54:32.585507+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/ids.ts

## Purpose

Single source of truth for how the API answers a malformed identifier. It distinguishes two positions—path params (404, indistinguishable from an unknown id) versus body/query fields (422 `VALIDATION_ERROR` naming the field)—and provides both the runtime guard (`requireId`) and the schema-aware bulk check (`malformedIdIssues`) that controllers and surfaces call instead of re-implementing the rule.

## Key elements

- **`CONTRACT_ID_PATTERN`** (exported) – The shared, storage-neutral `Id` regex (`^[0-9A-Za-z_-]+$`) as it appears in generated Zod schemas. Used to *recognise* which fields are ids; not the validity check itself.
- **`isValidObjectId(id: unknown): id is string`** (exported) – Type guard: exactly 24 hex characters (`/^[\da-f]{24}$/i`). Anything non-string is immediately "not an id."
- **`RequiredId`** (exported interface) – Config for `requireId`: `notFound` (i18n key, copy-builder function, or `null`), `name` (param/field, default `"id"`), `surface` (`"path"` | `"query"` | `"body"`, default `"path"`).
- **`requireId(request, response, config)`** (exported) – Reads one id via `readInput`; on success returns the string. On failure sends 404 (path) or 422 (body/query) and returns `undefined`.
- **`malformedIdIssues(schema, input, flagged?)`** (exported) – Walks a Zod schema to find every field whose contract pattern marks it as an `Id`, then inspects the raw request value at that position. Returns one `ResponseErrorItem` per string value that fails `isValidObjectId`. Skips fields already in `flagged` to avoid double-reporting.
- **`collectIdPaths` / `idPathsOf`** (internal) – Depth-first walk over Zod 4's `_zod.def` tree (objects, arrays, unions, intersections, pipes, transparent wrappers) to enumerate id positions. Results are memoised in a `WeakMap` keyed by schema instance.
- **`carriedAt`** (internal) – Resolves a schema path (with `'*'` for array indices) against the actual request input to produce dotted field names and their values.
- **`fieldIdIssue`** (internal) – Builds the 422 `ResponseErrorItem` (code, i18n message, `details.field`).

## Relationships

- **`request.ts`** – Imports `readInput` and the `RequestSurface` type; `requireId` delegates all input extraction to it.
- **`response.ts`** – Imports `rejectResponse` and `ResponseErrorItem`; every failure path funnels through `rejectResponse`.
- **`validation-messages.ts`** – Imports `attributeOf` to turn a dotted field path into a human-readable attribute for i18n messages.
- **`i18n/index.ts` / `i18n/context.ts`** – Imports the `t` translator for `"validation.required"` and `"validation.invalid-format"` messages.
- **`object-guards.ts`** – Imports `isPlainObject` used inside `carriedAt` to safely descend into nested request bodies.
- **`surfaces/create-*-controller.ts`** (delete, item, restore, update) – Call `requireId` to gate their route handlers before the controller body executes.
- **Module controllers** (`delete-session`, `get-account-export`, `delete-address`, `put-address-default`) – Either call `requireId` for path ids or `malformedIdIssues` for body/query id fields, passing their own `notFound` copy and the relevant Zod schema.
- **`controller.ts`** – The generic controller factory that these surfaces build on; it is the layer that invokes the id checks before delegating to module-specific logic.

## Notes

- **Two different regexes, two different jobs.** `CONTRACT_ID_PATTERN` is deliberately permissive (the OpenAPI contract's shared scalar). `OBJECT_ID_PATTERN` is the strict 24-hex check this backend actually issues. A value can pass the contract and still be rejected here.
- **Mongoose's 12-byte binary form is excluded.** `isValidObjectId` uses a regex, not `mongoose.Types.ObjectId.isValid`, so the 12-character binary form (which no route ever produces) is not accepted.
- **Zod 4 internals are walked.** `collectIdPaths` reads `_zod.def`, which the Zod docs explicitly designate as the supported hook for library tooling. If Zod bumps its major version, the `SchemaNode` shape and the `TRANSPARENT` set may need updating.
- **Only strings are judged malformed by `malformedIdIssues`.** Non-string values (missing, numbers, objects) are left to the schema's own validation; re-reporting them here would duplicate error items on the same field.
- **404 for path ids is intentional.** The module's docblock states the design goal: a malformed path id is *indistinguishable* from an unknown one, so an attacker cannot probe which ids are syntactically valid.
- **Schema walk is cached per schema instance** via `WeakMap`, so a controller's schema is traversed once at first use, not on every request.
