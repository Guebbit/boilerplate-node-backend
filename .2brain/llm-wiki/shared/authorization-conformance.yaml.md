---
source: shared/authorization-conformance.yaml
sha256: 79d14126ce114a93583f17918609d79aa3d9f6c098a5a5c7fdd54ade2f8e4748
generated_at: 2026-11-08T03:04:09.714594+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-conformance.yaml

## Purpose

A byte-identical conformance test suite committed to both `boilerplate-node-backend` (CASL) and `boilerplate-php-laravel-backend` (spatie/laravel-permission). Each repository runs every case against its own authorization engine; passing the same expectations on both sides is the contract that the two implementations are semantically equivalent. The file is weighted toward **deny** cases, with `allow` entries serving as controls to prove a deny was earned by the rule rather than by a blanket refusal.

## Key elements

- **`version: 1`** — schema version of the conformance format.
- **`admin-permissions` (YAML anchor `&admin_permissions`)** — the full expanded rule set a tenant `admin` holds. Manually kept in sync with the `admin` role definition in `authorization-roles.yaml`; no machine link exists between the two.
- **`moderator-permissions` (YAML anchor `&moderator_permissions`)** — same pattern for the `moderator` role.
- **`cases:`** — the list of authorization assertions. Each entry has:
  - `name` — a single-sentence description of the invariant being tested.
  - `caller` — resolved identity: `id`, `scope` (`tenant` | `platform`), `tenantId`, `permissions` (list of `action:Subject` strings, possibly via anchor).
  - `action` — one of the actions defined in `authorization-keys.yaml`.
  - `subject` — CASL subject type (e.g. `Order`, `Payment`).
  - `resource` — row attributes under test; empty/absent means the question is about the action alone (route-guard level).
  - `expect` — `allow` or `deny`.
- **Section groupings** (via comment banners): *Scope invariant*, *Tenancy*, *Ownership*.

## Relationships

- **`shared/authorization-keys.yaml`** — the closed vocabulary of `action:Subject` permission strings used in `permissions` arrays and in the `action` field of each case. A case referencing an action not present in the keys file is invalid.
- **`authorization-roles.yaml`** (sibling, not in the immediate graph) — the `admin-permissions` and `moderator-permissions` anchors are hand-maintained expansions of that file's role sets; drift between them is a review-time problem, not a machine-detected one.

## Notes

- The file is **committed with identical bytes** in both backend repos. Editing it in one repo requires a byte-for-byte copy to the other; a merge conflict or partial sync breaks the conformance guarantee silently.
- `scope` is **never both** `tenant` and `platform` in a single caller — the model treats them as mutually exclusive namespaces.
- The anchors are kept in sync **by hand** with `authorization-roles.yaml`. Adding a rule to the role file without updating this file (or vice-versa) will not produce a build error; it is caught only at review time.
- A case with an absent/empty `resource` object tests the *action-level* permission (what a route guard checks), not a row-level check.
- The design principle stated in the header: every case must be explainable in one sentence. If it needs a paragraph, the authorization model itself is the problem.
