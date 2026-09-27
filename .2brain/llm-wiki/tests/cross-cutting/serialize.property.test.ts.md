---
source: tests/cross-cutting/serialize.property.test.ts
sha256: ec4c2fef250b37ed8a022cc243e91dc9f7a04148f2f71bc3882dfa53c934828f
generated_at: 2026-09-27T15:52:26.546225+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/serialize.property.test.ts

## Purpose

Property-based (fast-check) tests that pin down the universal guarantees of the serialization transform in `applySerialization` — rename `_id`→`id`, delete `__v`, drop every `omit` key — for *any* document shape, not just the handful the models define. These guarantees are load-bearing: 95 of the OpenAPI schemas declare `additionalProperties: false`, so a single leaked internal key is a contract violation. The tests also cover the `.lean()`/`.aggregate()` path, where Mongoose has not pre-processed the document.

## Key elements

- **`RUN`** – shared fast-check config: fixed seed `20_260_809`, 300 runs, `endOnFailure: true`.
- **`fakeSchema()`** – minimal `{ set: () => 0 }` stand-in so `applySerialization` can be called without a real Mongoose schema.
- **`buildTransform(options?)`** – convenience wrapper that calls `applySerialization(fakeSchema(), options)` and returns a ready-to-invoke `SerializeTransform`.
- **`documentKey()`** – arbitrary string key with `__proto__` filtered out (spread-operator prototype quirk, not a serializer concern).
- **`documentLike()`** – `fc.dictionary` of 1–8 JSON-ish keys/values.
- **`withReservedFields()`** – layers a non-empty `_id` string and an integer `__v` onto a `documentLike`, so every generated case exercises both the rename and the delete.
- **`describe('applySerialization — universal guarantees')`** – ten `fc.assert` properties covering:
  - `_id` never present in output
  - `__v` never present in output
  - `_id` renamed to a string `id` for any id representation
  - `dropId: true` removes both `_id` and `id`
  - every key in `omit` is absent from output
  - every key *not* in the reserved/omit set is preserved (complement guard)
  - transform returns the same object reference (in-place mutation)
  - idempotency (applying twice yields the same result)
  - no exception thrown for any document shape
  - `after` hook runs exactly once, after the shared rename/delete steps

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – the sole subject under test. The file imports `applySerialization` (function) and the `SerializeTransform` type. No other source modules are imported; the test is self-contained apart from `fast-check`.

## Notes

- **Seeded for reproducibility.** The file header states that any counterexample found should be written back as a concrete example with its seed in a comment.
- **`Object.hasOwn` over `toHaveProperty`.** The omit and "no `_id`" assertions deliberately use `hasOwn` to check own properties only; `toHaveProperty` walks the prototype chain and would report inherited members like `toString`.
- **In-place mutation is a contract.** The transform mutates the input object and returns that same reference. Both the `toJSON` path (Mongoose discards the return, keeps the mutation) and the lean path (`normalize` keeps the returned value) depend on identity being preserved.
- **Complement test matters.** Without "keeps every key it was not asked to touch," a transform that deleted *all* keys would still pass every "drops X" assertion.
- **`__proto__` exclusion is a test-hygiene detail**, not a serializer guarantee — generating it would produce false counterexamples caused by the spread operator setting the prototype rather than creating an own key.
