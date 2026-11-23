---
source: src/modules/locales/tests/unit/service.test.ts
source_sha256: 12d7417e54bb3a1da8c0ff34016ce5fb3f9244fb0f42ec49919e48f087d4040d
context_sha256: 97ff0f4e64a7a67941d74ff04d7ee5c1e86eaf498499eb1c01e9fd5509df73a4
generated_at: 2026-11-22T05:52:02.592612+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/unit/service.test.ts

## Purpose
Unit tests for the pure half of `localeService`: the message-tree builder, the key-collision rules and the manifest merge. These decisions fail silently when wrong (a dropped key, a language claiming a capability it lacks), so they are asserted directly without touching the database. The write paths that call them are covered elsewhere: Mongo-backed in `repository.test.ts` and over HTTP in the contract suite.

## Key elements
- `language(overrides)`: local helper that builds a stubbed `LocaleDocument` (via `asStub`) with defaults for name, nativeName, direction (`ltr`), revision (0) and active (true). Only `tag` is required.
- `buildMessageTree`: expands flat dotted keys into a nested object. Tests cover:
  - an empty input gives `{}` (deliberately not a 404);
  - an undotted key stays at the root;
  - deep nesting works;
  - a key that is both a leaf and a group throws, in either insertion order;
  - a stored `__proto__` segment becomes an ordinary property and does not pollute the prototype.
- `findKeyCollision`: detects an ancestor that is already a leaf, or a descendant of a key about to become a leaf. It matches only at dot boundaries (`a.bc` is not under `a.b`) and ignores identical keys, which count as duplicates. It returns nothing (`toBeUndefined`) when there is no collision.
- `findBatchCollision`: finds a colliding pair inside one batch, returned as `['a.b', 'a.b.c']`, and returns nothing (`toBeUndefined`) for a consistent batch.
- `findDuplicateKey`: returns the repeated key, or nothing (`toBeUndefined`) for distinct keys.
- `findUnsafeKeySegment`: refuses `__proto__`, `constructor` and `prototype`, returning the segment. It returns `''` for empty segments (`a..b`, `a.`, `.a`) and nothing (`toBeUndefined`) for ordinary keys.
- `mergeCapabilities(staticTags, rows, entryCounts, disabledStatic?)`: merges deployed-file tags with stored language rows into manifest rows. Tests cover:
  - a static-only language gets `apps: [BACKEND]`, `source: static` and zero entries, and is named from its tag (e.g. "Spanish");
  - a row for a static tag can switch it off, via the optional fourth argument, a `Set` of tags;
  - a database-only language gets `apps: [FRONTEND]` and `source: dynamic`, with all `actions` flags false;
  - the `active` flag is carried through;
  - a language present in both tiers becomes one row with `apps: [BACKEND, FRONTEND]` and `source: both`;
  - stored rows supply the display names;
  - output is sorted by tag;
  - a tag missing from the count map gets `entryCount` 0.
- `isRightToLeft`: true for `ar`, `he`, `fa` and region variants such as `ar-EG`, false for `en`, `es` and `pt-BR`.
- `describeLanguage(tag, locale)`: names a language in a given locale (`es` in `en` gives "Spanish", `it` in `it` gives "italiano"). Its fallback-to-tag test is cut off in the source shown, so this page does not describe the remaining tests.

## Relationships
- Imports `localeService` from the locales services barrel (`src/modules/locales/services/index.ts`) and exercises its pure functions. The related `src/modules/locales/services/capabilities.ts` and `src/modules/locales/services/languages.ts` sit alongside it.
- Uses the `LocaleDocument` type from `src/modules/locales/model.ts` and the `LocaleDirection` and `LocaleSource` enums from `src/types/index.ts`.
- Uses `BACKEND` and `FRONTEND` app constants from `src/modules/locales/tests/unit/apps.fixture.ts` for the expected `apps` arrays.
- Uses `asStub` from `tests/support/stub.ts` to build partial documents.
- The write paths that call these rules, such as `src/modules/locales/controllers/post-locale.ts` and `src/modules/locales/controllers/post-locale-activation.ts`, are tested elsewhere, not here.

## Notes
- Tests are written to be order-independent. Collision throws are asserted in both leaf-then-group and group-then-leaf order.
- The `__proto__` test is a second line of defense. Write-time validation (`findUnsafeKeySegment`) refuses such keys, but rows inserted another way (ops scripts, mongosh, old imports) must still not pollute anything.
- Inactive rows only reach `mergeCapabilities` for admin manifests. The `active` flag lets an admin tell them apart, and other callers only see `true`.
