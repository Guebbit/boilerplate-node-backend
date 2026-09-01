# tests/cross-cutting/serialize.property.test.ts

## Purpose

Property-based tests (via `fast-check`) that verify the universal guarantees of `applySerialization` — the single point where a stored document becomes a wire payload. It proves the `_id`→`id` rename, `__v` deletion, and `omit` removal hold for *any* input shape, not just the handful the models define. This matters because 95 of `openapi.yaml`'s schemas use `additionalProperties: false`, and the transform must handle both the `toJSON` path (Mongoose pre-strips) and the `.lean()`/`.aggregate()` path (raw BSON, no Mongoose help).

## Key elements

- **`RUN`** — shared fast-check config: fixed seed `20_260_809`, 300 runs, stop on first failure.
- **`fakeSchema()`** — returns a one-method stub (`{ set: () => 0 }`) so `applySerialization` can be called without a real Mongoose schema.
- **`buildTransform(options?)`** — wraps `applySerialization(fakeSchema(), options)` to produce a `SerializeTransform` for assertions.
- **`documentKey()`** — `fc.string()` filtered to exclude `__proto__` (spreading that key sets the prototype, not an own key).
- **`documentLike()`** — arbitrary of a `Record<string, unknown>` with up to 8 JSON-ish values.
- **`withReservedFields()`** — layers `_id` (non-empty string) and `__v` (integer) onto a `documentLike` body so every generated case exercises the rename and version-key delete.
- **10 property assertions** in a single `describe` block covering: no `_id` in output, no `__v`, `_id`→`id` rename, `dropId` removes both spellings, omitted keys absent, non-omitted keys preserved, in-place mutation (same object identity), idempotency, no-throw on arbitrary input, and `after` hook fires exactly once after shared steps.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — the sole production import. The test exercises `applySerialization` (constructor) and the `SerializeTransform` type. The test is the contract boundary: a regression here surfaces as contract-test failures in `tests/contract/` against the OpenAPI schemas.

## Notes

- The `__proto__` exclusion in `documentKey` is a JavaScript spread-operator artefact, not a serializer concern — generating it would produce false counterexamples about the test harness.
- Assertions use `Object.hasOwn` rather than Jest's `toHaveProperty` because the latter walks the prototype chain and would report `toString` as present on every object.
- The in-place mutation guarantee (`expect(...).toBe(input)`) is load-bearing: `normalize` in the repository layer keeps the returned reference for the lean path, while the `toJSON` path discards it and relies on the mutation.
- Counterexamples discovered with the fixed seed are intended to be written back as concrete examples with the seed noted in a comment.
