---
source: src/modules/locales/tests/unit/service.test.ts
sha256: 9d8c15da5dfef616b69e8040967f4f8ee9d3f7247f288a017070a7b97cfff142
generated_at: 2026-11-08T06:29:46.862269+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/service.test.ts

## Purpose

Unit tests for the pure, decision-making half of `localeService`: the message-tree builder, key-collision detectors, unsafe-segment guard, and the capability manifest merge. These functions make correctness-critical choices (dropping a key, misclassifying a language's tier) that fail silently rather than throwing at the DB or HTTP layer, so they are exercised here in isolation without Mongo or a running server.

## Key elements

- **`buildMessageTree`** (tested) — Expands a flat list of `{ key, value }` pairs into a nested object. Throws when a key must be both a leaf and a parent (in either insertion order). Asserts `__proto__` segments become ordinary properties, not prototype mutations.
- **`findKeyCollision`** (tested) — Returns the existing key that is an ancestor *or* descendant of a candidate. Distinguishes true dotted-ancestor relationships from mere shared prefixes (`a.bc` ≠ child of `a.b`). Excludes identical-key duplicates.
- **`findBatchCollision`** (tested) — Detects collisions *within* a proposed batch before any row is written.
- **`findDuplicateKey`** (tested) — Names a key repeated in a batch.
- **`findUnsafeKeySegment`** (tested) — Rejects `__proto__`, `constructor`, `prototype`, and empty segments (`a..b`, `a.`, `.a`).
- **`mergeCapabilities`** (tested) — Folds static (deployed-file) tags, dynamic (database) rows, entry counts, and an optional inactive set into a single ordered manifest array. Covers backend-only, frontend-only, both-tier, display-name override, active-flag pass-through, and tag-ordering guarantees.
- **`isRightToLeft`** (tested) — Maps a language tag (including region subtags like `ar-EG`) to a boolean.
- **`describeLanguage`** (tested) — Returns the language's display name in the requested locale, falling back to the raw tag.
- **`language()`** (local helper) — Builds a minimal `LocaleDocument` with sensible defaults for `mergeCapabilities` assertions.

## Relationships

- **`src/modules/locales/services/index.ts`** — Source of the `localeService` object under test; every `it` block calls one of its exported methods.
- **`src/modules/locales/model.ts`** — Provides the `LocaleDocument` type used by the `language()` helper and assertion shapes.
- **`src/types/index.ts`** — Provides the `LocaleDirection` and `LocaleSource` enums referenced in expected values.
- **`src/modules/locales/tests/unit/apps.fixture.ts`** — Provides the `BACKEND` / `FRONTEND` constants used in `mergeCapabilities` assertions to avoid hard-coding app identifiers.

## Notes

- The file deliberately tests only the *pure* half of the service. Write paths that persist results are covered by `repository.test.ts` (Mongo) and the HTTP contract suite, as stated in the module JSDoc.
- Collision tests assert **both** insertion orders (leaf-then-group and group-then-leaf) because a silent drop would depend on order and could go undetected in a single-order test.
- `mergeCapabilities` ordering is asserted to be **by tag**, which is the contract that makes manifest diffs stable across deployments.
- The `__proto__` test is a defence-in-depth check: write-time validation (`findUnsafeKeySegment`) is the primary guard, but the tree builder must also be safe against rows that entered the collection through an older import or ops script.
