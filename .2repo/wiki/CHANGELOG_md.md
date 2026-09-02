# CHANGELOG.md

## Purpose
Records all notable changes to the API contract (`openapi.yaml`), defining a **breaking change** as one a generated client cannot absorb without being regenerated. Serves as the canonical history for consumers of the contract and the repository's own tooling gates.

## Key elements
- **`[3.0.0]` (2026-08-23)** — Major release introducing the modular-monolith + domain-layer architecture. Documents all breaking contract changes (stock reservation model, translation `scope`→`tenant`, locale objects, `/health` readiness shape, audit pagination, whoami 401 semantics, single emitter per analytics event, demo dataset declarations), new features (demo profile, payments, delivery, inventory movements, analytics, credential budgets, customer surface, sessions), and breaking tooling changes (strict linting, `complete:fix` gate, byte-mirrored contract requirement).
- **`Unreleased / Fixed`** — Post-3.0.0 corrections: missing `422` declarations on id-taking routes, `GET /feedback` body removal, `hardDelete` param consistency, cart-line visibility guard for hidden/soft-deleted products, `canTransition` no-op path actor check, deleted-account `401` alignment, `shippingCost` default removal, and server-side password complexity policy (`PasswordNew` schema).
- **`Unreleased / Changed`** — Audit vocabulary consolidation (action names de-duplicated against `outcome`/`actor_role` fields), cart-product-eligibility centralisation in `cart/services/items.ts`, **breaking**: `nodeVersion`→`runtimeVersion` in readiness payload, removal of Node-specific descriptions from the shared contract, and further contract hygiene (content truncated).

## Relationships
- **`asyncapi.public.yaml`** — Graph-adjacent contract file. The changelog references the shared contract as byte-identical across three repositories and notes that "byte-mirrored contract files require the paired frontend at the matching commit," placing `asyncapi.public.yaml` in the same multi-repo contract-sharing arrangement, though the changelog body does not name it directly.

## Notes
- The contract being documented is **`openapi.yaml`**, not `asyncapi.public.yaml`; the changelog explicitly scopes itself to that file.
- `main` forked from the 2.1.0 line before 3.0.0 was cut, so every 3.0.0 entry is new relative to 2.1.0.
- The file is truncated in the source; the `Unreleased / Changed` section is incomplete and may contain additional entries.
- Several fixes reference specific test files that act as living contracts (e.g., `tests/cross-cutting/contract-error-declarations.test.ts`, `tests/cross-cutting/audit-actions.test.ts`)—updating the changelog without updating the corresponding test is a likely source of drift.
- The `PasswordNew` schema intentionally avoids a `pattern` regex because lookahead-based patterns break the fuzz generator in `tests/support/spec-arbitraries.ts`.
