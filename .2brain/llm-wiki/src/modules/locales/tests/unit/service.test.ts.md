---
source: src/modules/locales/tests/unit/service.test.ts
sha256: 65f4700cc9382d5808ebc813223718e35ca889124abd84784e2e0583b991d6b7
generated_at: 2026-10-15T10:49:15.511314+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/service.test.ts

## Purpose

Unit tests for the "pure" half of `localeService` — the tree builder, key-collision rules, manifest merge, RTL detection, and language-name helpers. These functions involve no database or HTTP, so they are asserted directly here rather than through the repository or contract suites.

## Key elements

- **`language(overrides)`** — local factory that builds a minimal `LocaleDocument` from a tag plus optional overrides; the only fixture in this file.
- **`describe('buildMessageTree')`** — verifies flat dotted-key → nested-object expansion, empty-input handling, deep nesting, and the two throw paths (leaf-before-group and group-before-leaf). Also asserts the `__proto__` pollution guard.
- **`describe('findKeyCollision')`** — asserts ancestor/descendant collision detection, segment-boundary correctness (`a.bc` ≠ child of `a.b`), and that identical keys (duplicates) are *not* reported.
- **`describe('findBatchCollision')`** — confirms intra-batch collision pairs are caught before any write.
- **`describe('findDuplicateKey')`** — names a repeated key within a batch; returns `undefined` for distinct keys.
- **`describe('findUnsafeKeySegment')`** — rejects `__proto__`, `constructor`, `prototype`, and empty segments (`a..b`, `a.`, `.a`); accepts ordinary dotted keys.
- **`describe('mergeCapabilities')`** — covers static-only, dynamic-only, and both-tier languages; display-name fallback to tag; `active` flag passthrough for admin manifests; tag-order sorting; zero-entry default.
- **`describe('isRightToLeft')`** — RTL for `ar`, `he`, `fa` (including region tags like `ar-EG`); LTR for `en`, `es`, `pt-br`.
- **`describe('describeLanguage')`** — English name for admin, native name for picker, tag fallback for unknown tags.

## Relationships

- **`src/modules/locales/services/index.ts`** — the system under test; `localeService` is imported and its methods are called throughout.
- **`src/modules/locales/model.ts`** — supplies the `LocaleDocument` type used by the `language()` helper.
- **`src/types/index.ts`** — provides `LocaleDirection` and `LocaleSource` enums referenced in assertions.
- **`src/modules/locales/tests/unit/apps.fixture.ts`** — provides the `BACKEND` / `FRONTEND` app-identifier constants used in `mergeCapabilities` assertions.

## Notes

- The file deliberately scopes itself to pure logic. Write-path coverage (Mongo) lives in `repository.test.ts`; HTTP-level coverage is in the contract suite.
- The `buildMessageTree` collision tests assert **both** insertion orders because a silent drop would depend on order and could pass on one deployment and fail on another.
- The `__proto__` test in `buildMessageTree` is a second-line defense: `findUnsafeKeySegment` is the write-time gate, but a row introduced via `scripts/ops/`, mongosh, or a legacy import must still be neutralised at read time.
- `describeLanguage` returning the raw tag for an unknown language (e.g. `zz`) is intentional — it avoids a 500 when ICU data is absent in a given build.
- The `language()` helper is file-local; it is not exported and not shared with other test files.
