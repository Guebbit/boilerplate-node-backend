---
source: src/modules/locales/tests/unit/service.test.ts
sha256: 7b1dead00fc254681127c347ff4ed131ef12549af8e513aa1227a5cafaf3cc80
generated_at: 2026-11-14T20:25:33.545714+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/service.test.ts

## Purpose

Unit tests for the stateless, decision-making half of `localeService` — the message-tree builder, key-collision rules, and the capability-manifest merge. These functions fail silently when wrong (a dropped key, a language claiming a capability it lacks), so they are asserted directly here without a database. Write paths that call into them are covered elsewhere (`repository.test.ts`, the contract suite).

## Key elements

- **`language(overrides)`** — local helper that builds a minimal `LocaleDocument` stub via `asStub` for `mergeCapabilities` tests.
- **`describe('buildMessageTree')`** — verifies flat dotted-key → nested-object expansion, empty-input handling, deep nesting, collision throws (both insertion orders), and `__proto__` pollution resistance.
- **`describe('findKeyCollision')`** — verifies ancestor/descendant detection, prefix non-collision (`a.b` vs `a.bc`), and that identical keys are *not* reported here (that's `findDuplicateKey`).
- **`describe('findBatchCollision')`** — verifies intra-batch collision pairs and pass-through of consistent batches.
- **`describe('findDuplicateKey')`** — verifies naming of a repeated key in a batch.
- **`describe('findUnsafeKeySegment')`** — verifies rejection of `__proto__`, `constructor`, `prototype`, and empty segments; acceptance of normal keys.
- **`describe('mergeCapabilities')`** — verifies the manifest merge: static-only, dynamic-only, both-tier languages; active/inactive flags; `apps` assignment; display-name fallback; tag ordering; zero-entry default.
- **`describe('isRightToLeft')`** — verifies RTL detection including region-tag base-language resolution.
- **`describe('describeLanguage')`** — verifies English vs. native naming and tag fallback for unknown tags.

## Relationships

- **`src/modules/locales/services/index.ts`** — source of the `localeService` object under test.
- **`src/modules/locales/model.ts`** — provides the `LocaleDocument` type used by the `language` helper and assertions.
- **`src/modules/locales/tests/unit/apps.fixture.ts`** — provides `BACKEND` / `FRONTEND` constants for `apps`-array assertions.
- **`tests/support/stub.ts`** — provides `asStub` for constructing typed stubs without a real DB instance.
- **`src/types/index.ts`** — provides `LocaleDirection` and `LocaleSource` enums used in expected values.

## Notes

- The module docstring explicitly delimits scope: this file covers the "pure" decisions only. DB-touching paths and HTTP contract behaviour live in `repository.test.ts` and the contract suite respectively.
- Collision tests deliberately assert **both** insertion orders (leaf-then-group, group-then-leaf) because the two branches are separate code paths and a single-order test would miss a regression.
- The `__proto__` test is described as the "second half" of the defense: `findUnsafeKeySegment` is the write-time gate; this test guards against a row that entered the collection via a script, mongosh session, or pre-check import.
- `mergeCapabilities` includes an admin-specific case (inactive rows carried in the manifest); for non-admin callers the repository never supplies inactive rows, so the `active: false` path is only observable here.
- The `language` helper uses `asStub` to satisfy TypeScript's structural typing without requiring a Mongoose instance — no connection or collection is involved.
