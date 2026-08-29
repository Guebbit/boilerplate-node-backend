# CHANGELOG.md

## Purpose

Records every notable change to the API contract (`openapi.yaml`) since version 3.0.0. It exists so that both humans and tooling can determine what broke, what was added, and *why*—using the working definition that a breaking change is one a generated client cannot absorb without being regenerated.

## Key elements

- **`[3.0.0]` (2026-08-23)** — The major release that established the modular-monolith architecture (domain folders under `src/modules/`, four-tier dependency direction, per-module contract fragments assembled into `openapi.yaml`). Documents all breaking contract changes (stock reservation model, `tenant` scope, readiness payload shape, audit pagination, etc.) and added features (demo profile, payments, delivery, analytics, credential budgets).
- **`Unreleased` → Fixed** — Bug fixes that correct contract declarations (missing `422` responses, invalid GET request bodies, undeclared `hardDelete` params) and a cart-line visibility gap. No contract surface change for the cart fix.
- **`Unreleased` → Changed** — Audit vocabulary consolidation (action names collapsed; `outcome`/`actor_role` fields carry the distinction), runtime-neutral `runtimeVersion` field, implementation-agnostic contract prose, `FeedbackRequestStatus` schema extraction, shared cache identity for GET/POST search pairs, and removal of unreachable request bodies on GET list endpoints.
- **`Unreleased` → Added** — `x-alias-of` extension on fourteen operation pairs (invisible to orval, no generated-type change), enforced by `contract-aliases.test.ts`.

## Relationships

- **CONTRACT_PLAN_POLYMORPHISM.md** — Documents the polymorphism strategy for contract types; the changelog's breaking-change entries (stock model, scope→tenant, readiness vocabulary) are the concrete contract shifts that plan anticipated.
- **README.md** — Points to this changelog as the source of truth for what changed between client-compatible releases; the "demo profile" and "modular monolith" entries here are the canonical descriptions the README references.
- **asyncapi.public.yaml** — The public async event contract that this changelog's "one emitter per analytics event" and "payments/delivery behind provider ports" entries govern; the changelog is the record of when and why event names or shapes shifted.

## Notes

- The file is **append-only within a release cycle**: the `Unreleased` section is the live working area; once a version is cut, its block is frozen and a new `Unreleased` begins.
- Every entry that mentions a test file (e.g. `contract-error-declarations.test.ts`, `audit-actions.test.ts`, `contract-search-parity.test.ts`) is not merely documentation—those tests are the enforcement mechanism. If you change the contract without updating the corresponding test, CI fails.
- `x-alias-of` entries explicitly state they produce **zero generated-type diff**; do not remove them assuming they are inert comments—they are load-bearing for the paired frontend's route-discovery.
- The 3.0.0 block notes that `main` forked from the 2.1.0 line; there is no 2.x → 3.0 migration guide in this file. The "Breaking — contract" bullet list *is* the migration guide.
