---
source: tests/cross-cutting/serialize.property.test.ts
sha256: 6d0db000a13b5d5a9665611c6aa5171a5024072512473e0900e358a4b20f18cd
generated_at: 2026-09-23T20:00:14.193909+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/serialize.property.test.ts

## Purpose

Property-based tests (fast-check) that verify the universal invariants of `applySerialization` for _any_ document shape, not just the five model shapes that exist today. Because 95 of `openapi.yaml`'s schemas declare `additionalProperties: false`, a single leaked `_id` or `__v` is a contract violation. The transform also serves two very different inputs (Mongoose `toJSON` vs. raw `.lean()`/`.aggregate()` BSON), and these tests cover the second case where Mongoose provides no help.

## Key elements

- **`RUN`** — Shared test config: fixed seed `20_260_809`, 300 runs, `endOnFailure: true`. Counterexamples should be written back as examples with this seed.
- **`fakeSchema()`** — Minimal `{ set: () => 0 }` stand-in so `applySerialization` can be called without a real Mongoose schema.
- **`buildTransform(options?)`** — Convenience wrapper around `applySerialization(fakeSchema(), options)` returning a ready-to-call `SerializeTransform`.
- **`documentKey()`** — Arbitrary string arb filtered to exclude `__proto__` (spreading `__proto__` mutates the prototype, not the object, producing false counterexamples).
- **`documentLike()`** — Arbitrary JSON-keyed dictionary (max 8 keys) representing an opaque document body.
- **`withReservedFields()`** — Layers `_id` (non-empty string) and `__v` (integer) onto a `documentLike` so every case exercises both the rename and the version-key deletion.
- **`describe('applySerialization — universal guarantees')`** — Ten property assertions: `_id` absent, `__v` absent, `_id`→`id` string rename, `dropId` removes both spellings, `omit` keys absent, non-reserved keys preserved, in-place mutation (same reference returned), idempotency, no-throw on arbitrary shapes, and `after` hook runs once _after_ shared steps.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — The module under test. Provides `applySerialization` (the function being property-tested) and the `SerializeTransform` type. The test also references `SerializableSchema` in a comment to explain why `fakeSchema` is sufficient, and notes that `normalize` in `create-repository` depends on the in-place mutation contract this test enforces.

## Notes

- The test deliberately uses `Object.hasOwn` rather than `toHaveProperty`/`toHaveProperty`-style assertions, because the latter walks the prototype chain and would report inherited members like `toString` as "present." Only own keys matter for wire serialization.
- The `never throws` property uses `fc.anything()` (not `fc.jsonValue()`), making it strictly broader — it can generate `undefined`, `NaN`, `Symbol`, functions, etc. as values.
- The in-place mutation property (`returns the same object it was handed, mutated in place`) is load-bearing for the `.lean()`/`.aggregate()` code path in `create-repository`, where the caller keeps the returned reference. The `toJSON` path discards the return value and relies on the mutation instead.
- Seed is fixed; if a new counterexample is found, the convention is to pin it as a concrete example with the seed in a comment rather than changing the seed.
