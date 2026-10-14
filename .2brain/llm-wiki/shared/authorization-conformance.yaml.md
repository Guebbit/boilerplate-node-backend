---
source: shared/authorization-conformance.yaml
sha256: 88584551c8824287601aa2f80dd36b132a02c329b8e60779053b3b657ed9aec9
generated_at: 2026-10-14T07:34:19.675056+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-conformance.yaml

## Purpose

A conformance fixture that both backend implementations (Node/CASL and PHP/spatie-laravel-permission) must evaluate to identical results. It is committed with identical bytes into `boilerplate-node-backend` and `boilerplate-php-laravel-backend`, and each repo runs every case against its own authorization engine. The file exists to pin the authorization model's observable behavior across two independent implementations, with special emphasis on **deny** cases: each `allow` exists only as a control that proves the adjacent `deny` was earned by the rule, not by an evaluator that simply refuses everything.

## Key elements

- **`admin-permissions` (YAML anchor `&admin_permissions`)** — The full set of tenant-scope keys an `admin` caller holds. Excludes the two `shopperOnly` basket keys (`cart.self.update`, `cart.self.checkout`). Referenced via `*admin_permissions` in cases that need "the most privileged tenant caller."
- **`moderator-permissions` (YAML anchor `&moderator_permissions`)** — Same pattern for the `moderator` role.
- **`cases`** — An ordered list of authorization assertions. Each case is a flat sentence: `name`, `caller` (id, scope, tenantId, permissions), `action`, `subject` (CASL subject type), `resource` (row attributes; empty means the question is about the action alone), and `expect` (`allow` | `deny`). Cases are grouped by invariant: scope separation, tenancy, ownership (`self` vs `any`), and key-granularity (e.g. `read` ≠ `export` ≠ `delete`).
- **`version: 1`** — Schema version marker for the case format.

## Relationships

- **`shared/authorization-keys.yaml`** — Every `action` field in a case must be one of the keys declared there. The file's header comment states this explicitly; the cases are meaningless if they reference an action the key registry does not define.
- **`shared/authorization-roles.yaml`** — The `admin-permissions` and `moderator-permissions` lists are manually kept identical to the `admin` and `moderator` role entries in that file. There is **no** schema link or import between the two files; drift is a review-time problem, not a machine-caught one.

## Notes

- **Manual sync is the contract.** Adding a key to `authorization-roles.yaml` without also adding it to the matching anchor here (or vice-versa) will not fail any test. `tests/unit/kernel/permissions.test.ts` validates the real preset role, never this fixture copy.
- **Scope is binary per caller.** A caller is either `tenant` or `platform`, never both. Cases deliberately include "mis-seeded" callers (a tenant caller holding a platform key, a platform caller holding a tenant key) to verify that the scope guard rejects them regardless of the key they hold.
- **`resource: {}` is intentional.** An empty resource object means the question is "may this caller perform the action at all?" (a route-guard question), not "may they do it on *this* row?"
- **The file is read as a specification, not a test script.** The header insists every case must be explainable in one sentence; if a case needs a paragraph, the model is wrong and the case is the messenger.
- **Identical-bytes constraint.** Because both repos commit the same file, any change here must be applied to both repositories in lockstep or the conformance suite will diverge.
