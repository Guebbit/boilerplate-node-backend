---
source: src/modules/locales/tests/unit/service.test.ts
sha256: 9d8c15da5dfef616b69e8040967f4f8ee9d3f7247f288a017070a7b97cfff142
generated_at: 2026-10-29T04:27:13.622100+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/service.test.ts

## Purpose

Unit tests for the pure, database-free half of `localeService`: the message-tree builder, key-collision detectors, capability manifest merge, RTL detection, and language naming. These functions are "decisions rather than plumbing" that fail silently when wrong, so they are asserted directly here. The write paths that call them are covered elsewhere (Mongo in `repository.test.ts`, HTTP in the contract suite).

## Key elements

- **`buildMessageTree` suite** — Verifies flat dotted-key → nested-object expansion, empty-input → `{}`, arbitrary nesting depth, and that a key which would be both a string and a group **throws** (tested in both insertion orders). Also asserts a stored `__proto__` segment becomes an ordinary property rather than polluting the prototype chain.
- **`findKeyCollision` suite** — Asserts ancestor/descendant collision detection, confirms `a.bc` is *not* a descendant of `a.b` (dot-boundary rule), and that an identical key is treated as a duplicate, not a collision.
- **`findBatchCollision` suite** — Catches pairs that collide only with each other within a batch; passes internally consistent batches.
- **`findDuplicateKey` suite** — Names a repeated key in a batch; returns `undefined` for distinct keys.
- **`findUnsafeKeySegment` suite** — Rejects `__proto__`, `constructor`, `prototype`, and empty segments (`a..b`, `a.`, `.a`); accepts ordinary dotted keys.
- **`mergeCapabilities` suite** — Covers static-only, dynamic-only, and both-tier languages; active/inactive flag pass-through; display-name fallback from stored row; tag-ordered output; zero-entry default. Uses the local `language()` factory and `BACKEND`/`FRONTEND` fixture constants.
- **`isRightToLeft` suite** — Confirms `ar`, `he`, `fa` (and region variants like `ar-EG`) are RTL; `en`, `es`, `pt-br` are LTR.
- **`describeLanguage` suite** — Names a language in the requested audience language; falls back to the raw tag for unknown codes.
- **`language()` helper** — Local factory that spreads overrides onto a minimal `LocaleDocument` with `tag` as default `name`/`nativeName`.

## Relationships

- **`src/modules/locales/services/index.ts`** — Primary subject under test; imports `localeService` from here.
- **`src/modules/locales/model.ts`** — Provides the `LocaleDocument` type used by the local `language()` factory.
- **`src/types/index.ts`** — Source of `LocaleDirection` and `LocaleSource` enum/union values referenced in assertions.
- **`src/modules/locales/tests/unit/apps.fixture.ts`** — Supplies `BACKEND` and `FRONTEND` app-identifier constants used in `mergeCapabilities` expectations.
- **`src/modules/locales/services/languages.ts`** — Likely home of `buildMessageTree`, `findKeyCollision`, `findBatchCollision`, `findDuplicateKey`, `findUnsafeKeySegment`, `isRightToLeft`, `describeLanguage`.
- **`src/modules/locales/services/capabilities.ts`** — Likely home of `mergeCapabilities`.
- **`src/modules/locales/controllers/create-locale.ts` / `activate-locale.ts`** — Downstream callers of the tested pure functions; their write paths are tested in integration/contract suites, not here.
- **`scenarios/locales.ts`** — Contract-scenario fixtures that exercise the same service functions over HTTP.

## Notes

- The file deliberately excludes any database interaction; if a test needs Mongo, it belongs in `repository.test.ts`.
- `buildMessageTree` collision tests assert **both** insertion orders (leaf-then-group, group-then-leaf) because the two are separate code branches and a fix could silence only one.
- The `__proto__` test is defense-in-depth: write-time validation (`findUnsafeKeySegment`) is the first gate; this test guards against rows that entered the collection via scripts, mongosh, or pre-check imports.
- `findKeyCollision` appends a trailing dot before comparing (`a.b.` prefix) rather than calling `startsWith`, so `a.bc` is correctly *not* a descendant of `a.b`. The test documents this intent.
- `mergeCapabilities` output is always **tag-sorted**, so two manifests differ only where data actually changed — relevant for diffing in CI or client caching.
- The `active` flag on merged rows exists so the **admin** manifest can list inactive languages; non-admin callers never receive inactive rows from the repository.
