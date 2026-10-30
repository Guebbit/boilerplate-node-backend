---
source: shared/authorization-conformance.yaml
sha256: ef435d1ee3709caa27137c25cdabb167aa1bf7fc0331b5df6ab8b9ebadcdf3aa
generated_at: 2026-10-29T01:46:26.562808+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-conformance.yaml

## Purpose

A conformance contract defining authorization decisions that both backend implementations (CASL in Node, spatie/laravel-permission in PHP/Laravel) must answer identically. It is committed byte-for-byte into `boilerplate-node-backend` and `boilerplate-php-laravel-backend`; each repo runs every case against its own evaluator. The file's primary value is its **deny** cases—`allow` entries exist only as controls proving a neighboring deny was earned by a rule, not by an evaluator that refuses everything.

## Key elements

- **`version`** — schema version (currently `1`).
- **`admin-permissions` (anchor `&admin_permissions`)** — the fully expanded list of every tenant rule a verified `admin` holds (the `customer` audience rules plus the sets listed in `authorization-roles.yaml` for `admin`). Reused via YAML alias in cases that need "the most privileged tenant caller conceivable."
- **`moderator-permissions` (anchor `&moderator_permissions`)** — same treatment for the `moderator` role.
- **`cases`** — the test suite. Each case is a flat record:
  - `name` — a single-sentence description.
  - `caller` — `{ id, scope, tenantId, permissions }`; `scope` is `tenant` or `platform`; `id` is a resolved user/op id, never a role name.
  - `action` — one of the action keywords defined in `authorization-keys.yaml`.
  - `subject` — the CASL subject type (e.g. `Order`, `Product`, `ObservabilitySnapshot`).
  - `resource` — the row's attributes; **absent** means the question is about the action alone (a route-guard check).
  - `expect` — `allow` or `deny`.

Cases are grouped by concern: scope invariants (platform ↔ tenant), tenancy (cross-shop isolation), ownership (own-row vs. every-row rules like `read:` vs. `display:`), and specific rule boundaries.

## Relationships

- **`shared/authorization-keys.yaml`** — defines the canonical action vocabulary (`read`, `display`, `create`, `update`, `delete`, `export`, `manage`, `admin`, etc.) that every `action` field in a case must reference.
- **`shared/authorization-roles.yaml`** — declares the role→rule-set mappings (e.g. `admin` → which sets, `moderator` → which sets). The `admin-permissions` and `moderator-permissions` lists here are the *manual expansion* of those sets into individual rule ids.

## Notes

- **Manual synchronization, no schema link.** The `admin-permissions` and `moderator-permissions` lists must be kept identical to the expansion of `authorization-roles.yaml` by hand. A rule added to one file and not the other is a review-time problem, not a machine-caught one.
- **Deny-first philosophy.** The file explicitly states that an authorization suite made of happy paths "is worth so little." Every `allow` case exists to validate an adjacent `deny`; if you add a case, make sure its deny counterpart is present.
- **Single-sentence rule.** If a case needs a paragraph to explain, the authorization model is wrong. Cases are the messenger.
- **`scope` is exclusive.** A caller is `tenant` *or* `platform`, never both. Cases exist that prove a rule from the wrong scope is inert even if present in the permission list.
- **Byte-identical across repos.** Any edit must be applied identically in both boilerplate repos; a divergence silently breaks conformance.
