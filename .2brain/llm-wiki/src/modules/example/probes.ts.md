---
source: src/modules/example/probes.ts
source_sha256: aed784711bf14273c1955d51286bc83de1205beaa082412ad99755ee827eed0d
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T05:10:22.130748+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/probes.ts

## Purpose
Declares the example module's probe collection: requests that its API contract cannot describe, which the generated API client collection runs as probes. The file is meant to be deleted once every refusal the module has is reachable from its contract. Its module header points to `scripts/contracts/fragments.ts` as the related reference.

## Key elements
- `probes: Probe[]` is the only export. The `Probe` type comes from `@guebbit/openapi-runnable-collections`. It holds three probes, each with `name`, `why`, `method`, `path`, and optionally `auth` and `body`:
  - **Read of an absent id, anonymous:** `GET /examples/000000000000000000000000`. It expects a 404, the same answer a stranger gets for someone else's draft, so the two cases can't be told apart.
  - **Publish of an absent example:** `POST /examples/000000000000000000000000/publish` with `auth: 'bearer'`. It expects a 404 rather than a 409, because the edit-permission check runs before the legality of the move is checked.
  - **Edit with a malformed id:** `PATCH /examples/not-an-object-id` with `auth: 'bearer'` and body `{ title: 'x' }`. It expects a 404, the same as an absent id.

## Relationships
No graph neighbors. The file only imports the `Probe` type from the external package `@guebbit/openapi-runnable-collections`. The module header says the generated client collection consumes the probes.

## Notes
- Each probe's `why` explains the expected behavior. In the first two, the contract can describe the 404 but not a request that earns one.
- The malformed-id case exists because `Id` is a plain string in the contract. The Mongo-shaped ObjectId check lives in the controller, which refuses an id it cannot build like one that names nothing.
- The all-zero 24-character id is used as a well-formed id that no document holds.
