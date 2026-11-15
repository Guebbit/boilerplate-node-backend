---
source: tests/cross-cutting/serialize.property.test.ts
sha256: ba253933d232ba3b8a38cf04f2e25f0473a6dc8ad08f5602494cf684a8cd03ef
generated_at: 2026-11-14T23:07:41.018274+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/serialize.property.test.ts

## Purpose

Property-based tests (fast-check) for `applySerialization`, verifying its universal guarantees — `_id`→`id` rename, `__v` removal, `omit` key stripping, and preservation of all other keys — across arbitrary document shapes rather than a fixed set of model fixtures. This exists because the guarantees are load-bearing: 95 schemas in `openapi.yaml` declare `additionalProperties: false`, so a single leaked `_id` or `__v` is a contract violation, and the `.lean()`/`.aggregate()` path receives raw BSON with no Mongoose help.

## Key elements

- **`RUN`** — Fast-check config: fixed seed `20_260_809`, 300 runs, stops on first failure.
- **`fakeSchema()`** — Minimal `{ set, eachPath }` stand-in so `applySerialization` can be called without a real Mongoose schema.
- **`buildTransform(options?)`** — Wraps `applySerialization(fakeSchema(), options)`; the entry point every test uses.
- **`documentKey()`** — Arbitrary string key generator; filters out `__proto__` (see Notes).
- **`documentLike()`** — Arbitrary JSON-ish object body (≤ 8 keys).
- **`withReservedFields()`** — Layers `_id` (string) and `__v` (integer) onto a `documentLike`.
- **10 `fc.assert` properties** — Cover: `_id` absence, `__v` absence, `_id`→string `id` rename, `dropId` removing both spellings, `omit` key removal, non-omitted key preservation, in-place mutation (same reference returned), idempotency, no-throw on arbitrary input, and `after` hook called exactly once after shared steps.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — The sole SUT. Imports `applySerialization` and the `SerializeTransform` type. Every property asserts invariants of that function's output.
- **`@infrastructure/persistence/create-repository`** — Referenced in the in-place-mutation test: `normalize` there maps over lean rows and relies on the transform returning the same mutated object.
- **`tests/contract/`** (referenced in comments) — The contract suite that would catch a leaked `_id`/`__v`; this file is the property-level safety net that runs before that.

## Notes

- **Seeded.** Any counterexample should be written back as a concrete example with its seed in a comment (stated in the file header).
- **`__proto__` exclusion is a test-hygiene concern, not a serializer behavior.** Spreading an object containing `__proto__` mutates the prototype of the copy, silently dropping the field before the transform sees it. Generating it would produce false counterexamples.
- **`Object.hasOwn` over `toHaveProperty`.** The latter walks the prototype chain and would report `toString` on every object; wire-payload correctness is about own enumerable keys.
- **In-place mutation is a contract.** Both the `toJSON` path (discards return, keeps mutation) and the `.lean()` path (keeps return) depend on the transform mutating and returning the same object.
- **Idempotency matters in practice:** a lean row can be normalized and then serialized a second time; the result must not change.
- **`after` hook ordering:** it runs once, after the shared rename/delete steps, and must see the document already stripped (models use it for nested normalization).
