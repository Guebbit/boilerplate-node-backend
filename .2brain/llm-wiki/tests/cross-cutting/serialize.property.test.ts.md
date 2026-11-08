---
source: tests/cross-cutting/serialize.property.test.ts
sha256: 3b30e5cba6e648d9bf4153f39b00d6ed6b9e7308181b1a937513d5821cbdca2c
generated_at: 2026-11-08T09:32:34.811976+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/serialize.property.test.ts

## Purpose

Property-based tests for `applySerialization`, verifying that its guarantees (`_id`→`id` rename, `__v` deletion, `omit` key removal, in-place mutation, idempotency) hold for *any* input shape—not just the finite set of model schemas. This matters because 95 of the OpenAPI schemas declare `additionalProperties: false`, so a single leaked reserved key is a contract violation.

## Key elements

- **`RUN`** – Shared `fast-check` config: seed `20_260_809`, 300 runs, `endOnFailure: true`. Counterexamples are expected to be written back as fixed examples.
- **`fakeSchema`** – Minimal stand-in (`{ set, eachPath }`) so `applySerialization` can be called without a real Mongoose schema.
- **`buildTransform`** – Wraps `applySerialization(fakeSchema(), options)` to produce a `SerializeTransform` for test use.
- **`documentKey`** – Arbitrary string key, filtered to exclude `__proto__` (spreading such a key mutates the prototype rather than creating an own property).
- **`documentLike`** – Arbitrary `{ [key: string]: JSON-ish }` body (max 8 keys).
- **`withReservedFields`** – Layers a random `_id` (non-empty string) and `__v` (integer) onto a `documentLike` body so every case exercises rename + delete.
- **`describe` block (10 properties)** – Asserts: no `_id` on output; no `__v`; `_id`→`id` as string; `dropId` removes both spellings; all `omit` keys absent; non-reserved keys preserved; same object reference returned; idempotent; never throws; `after` hook called exactly once after shared steps.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – The sole production import. Provides `applySerialization` and the `SerializeTransform` type under test. The tests exercise its `toJSON` path and its `.lean()`/`.aggregate()` path (the latter has no Mongoose help and is the reason arbitrary-shaped generation is needed).

## Notes

- **Seeded & deterministic.** The seed in `RUN` must stay stable; any failing counterexample should be committed back as a concrete example with the seed in a comment.
- **In-place mutation is a contract.** The test asserts `toBe(input)`, not `toEqual`. Both the `toJSON` path (Mongoose discards the return) and the lean path (`normalize` in `create-repository` keeps the returned reference) rely on this.
- **`Object.hasOwn` over `toHaveProperty`.** Tests deliberately use `Object.hasOwn` to check own keys only, since `toHaveProperty` walks the prototype chain and would report inherited methods like `toString` as present.
- **`__proto__` exclusion is a JS quirk, not a serializer behavior.** Generating it would produce false counterexamples about the spread operator, not about `applySerialization`.
