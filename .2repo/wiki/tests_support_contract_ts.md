# tests/support/contract.ts

## Purpose

Side-effect setup file that registers `jest-openapi` with the project's `openapi.yaml` spec, making the `toSatisfyApiSpec()` assertion available globally. It exists to guard against over-serialization (leaking `_id`, `password`, populated sub-documents, etc.) by validating real HTTP responses against the OpenAPI document — a check that the generated Zod schemas cannot provide in this repo.

## Key elements

- **`jestOpenAPI(path.join(__dirname, '..', '..', 'openapi.yaml'))`** — Registers the OpenAPI spec (resolved to the project root) with `jest-openapi`. This is the only runtime statement; everything else is the import above it.
- **`toSatisfyApiSpec()`** — The assertion made available to any test file that imports this module. Usage: `expect(response).toSatisfyApiSpec()`.

## Relationships

- **All `src/modules/*/tests/contract/api.contract.test.ts` files** (account, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users, wishlist) — Each performs a bare `import '@tests/contract'` for the side effect of registering the spec, then calls `toSatisfyApiSpec()` on captured HTTP responses.
- **`tests/contract/request-contract.test.ts`** — Sibling contract test in the shared `tests/` tree; likely exercises the same assertion or the setup itself.
- **`docs/tools/contract-testing.md`** — Developer-facing documentation describing how to use and extend this setup.
- **`openapi.yaml`** (project root) — The spec document that all assertions validate against; not a dependency in the import graph but the data source for the assertions.

## Notes

- This file is imported **solely for its side effect**. There are no named exports; importing it is what wires `toSatisfyApiSpec()` into the global `expect`.
- The path to `openapi.yaml` is resolved relative to the file's own directory (`__dirname/../../openapi.yaml`), so it works regardless of which test file triggers the import.
- The lengthy header comment documents *why* Zod schemas (from `api/schemas.zod.ts`) are insufficient here: they are generated non-strict (stripping unknown keys rather than flagging them) and are used only for request validation, never for response validation. Keep this context in mind when considering "simpler" alternatives.
- The file must be imported **before** any `toSatisfyApiSpec()` call in a test file; the registration is one-time and idempotent, but ordering matters for clarity.
