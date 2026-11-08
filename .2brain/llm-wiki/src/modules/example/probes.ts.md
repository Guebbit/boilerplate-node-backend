---
source: src/modules/example/probes.ts
sha256: 0d2fcf5e644542ded6e2cf7d120eb7e72ce4c062c7f1ab69ebbb696fc94daed7
generated_at: 2026-11-08T05:51:45.984488+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/probes.ts

## Purpose

Defines the example module's probe collection — a set of API requests that exercise refusal paths the OpenAPI contract cannot express (e.g. anonymous 404s, invalid ObjectId shapes). These probes are executed by the generated client-collection runner (`scripts/contracts/client-collections-bundle.ts`) to verify that the server's error responses are indistinguishable from legitimate "not found" cases. The file should be deleted once every refusal is reachable from the contract alone.

## Key elements

- **`probes: Probe[]`** (exported) — The sole export. An array of three `Probe` objects imported from `@guebbit/openapi-runnable-collections`. Each entry declares `name`, `why`, `method`, `path`, and optionally `auth` / `body`.
  1. `GET /examples/000000000000000000000000` — anonymous read of a non-existent id; expects 404 identical to a stranger's draft.
  2. `POST /examples/000000000000000000000000/publish` (bearer) — publish on a non-existent id; expects 404 (permission check precedes state check).
  3. `PATCH /examples/not-an-object-id` (bearer, body `{ title: 'x' }`) — edit with a string the controller cannot build an ObjectId from; expects 404, same as a valid-but-absent id.

## Relationships

No graph neighbors are listed. At the module level the probes are consumed by the client-collection bundling script referenced in the doc comment, and the `Probe` type is supplied by `@guebbit/openapi-runnable-collections`.

## Notes

- The `why` field on each probe is load-bearing documentation: it explains *why* the contract cannot express this request, not just what status code is expected.
- The deletion criterion is stated in the module header: remove this file when every refusal the module can produce is reachable from its contract.
- The third probe encodes a controller-layer invariant (Mongo ObjectId shape check) that is invisible in the contract because `Id` is typed as a plain string there.
- See `docs/api/contract-fragmentation.md` for the broader rationale behind probes vs. contract coverage.
