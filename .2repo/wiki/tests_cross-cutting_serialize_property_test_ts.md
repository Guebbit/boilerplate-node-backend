# tests/cross-cutting/serialize.property.test.ts

## Purpose

Property-based tests (fast-check) that verify the universal guarantees of `applySerialization` — `_id`→`id` rename, `__v` deletion, `omit` key removal, and preservation of untouched keys — for *any* document shape, not just the five model shapes in use. The universality is load-bearing: 95 `openapi.yaml` schemas declare `additionalProperties: false`, so a single leaked reserved key is a contract violation. The tests specifically cover the `.lean()`/`.aggregate()` path, where Mongoose does not pre-strip `__v` or supply `id`.

## Key elements

- **`RUN`** — shared fast-check config: seed `20_260_809`, 300 runs, `endOnFailure: true`.
- **`fakeSchema()`** — minimal stand-in (`{ set: () => 0 }`) so `applySerialization` can be invoked without a real Mongoose schema.
- **`buildTransform(options?)`** — wraps `applySerialization` with the fake schema; the single factory used by every property.
- **`documentKey()`** — arbitrary string key, filtered to exclude `__proto__` (spread would set the prototype, not create an own key).
- **`documentLike()`** — `fc.dictionary` of ≤ 8 `fc.jsonValue()` entries; represents an arbitrary document body.
- **`withReservedFields()`** — layers `_id` (non-empty string) and `__v` (integer) onto a `documentLike` body.
- **Property tests** (10 `it` blocks under one `describe`):
  - `_id` never appears in output
  - `__v` never appears in output
  - `_id` is renamed to a string `id`
  - `dropId: true` removes both `_id` and `id`
  - Every `omit` key is absent (checked via `Object.hasOwn`)
  - Every non-reserved key the input had is preserved
  - The transform returns the *same* object reference it mutated
  - Double application is idempotent
  - Never throws for arbitrary shapes (`fc.anything()` values)
  - The `after` hook fires exactly once, *after* the shared steps, and sees the already-stripped document

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — the system under test. Imports `applySerialization` (the transform factory) and the `SerializeTransform` type. Every property calls into this module.
- **`tests/contract/`** (referenced in comments) — the contract suite that would fail if a reserved key leaked; this file exists to catch such leaks *before* they surface as OpenAPI schema violations.
- **`@infrastructure/persistence/base-repository`** (referenced in comments) — its `normalize` helper relies on the in-place mutation contract asserted here (same-object return).

## Notes

- **Seeded.** The seed is pinned in `RUN`. A failing counterexample should be added back as a concrete example with the seed noted in a comment (per the file header).
- **`Object.hasOwn`, not `toHaveProperty`.** Deliberate choice: `toHaveProperty` walks the prototype chain and would report inherited keys like `toString` as present. Only own keys matter for a wire payload.
- **`__proto__` exclusion is a test-hygiene issue**, not a serializer concern. Spreading an object whose key is `__proto__` mutates the target's prototype instead of creating an own property, so the fixture would be wrong before the transform runs.
- **In-place mutation is a contract.** The lean/aggregate path maps over rows and keeps the returned value; the `toJSON` path discards the return and relies on the mutation. Both work only because the same object is mutated and returned.
- **`after` hook ordering is tested.** Models use `after` for nested normalization; it must observe the document *after* the shared `_id`/`__v`/`omit` steps, not race them.
