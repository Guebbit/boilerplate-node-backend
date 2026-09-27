---
source: shared/authorization-conformance.yaml
sha256: 38295db1711e7fd8b495c68b2d4d5480af94940ec998179310606e2aa9eb1618
generated_at: 2026-09-27T14:00:58.520676+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-conformance.yaml

## Purpose

A backend-agnostic conformance suite of authorization decisions. It is committed byte-identical into both `boilerplate-node-backend` (evaluated by CASL) and `boilerplate-php-laravel-backend` (evaluated over `spatie/laravel-permission`), and each repo runs every case against its own implementation. The file intentionally leads with **deny** cases; every `allow` exists only as the control that proves the adjacent deny was earned by the rule rather than by a blanket-refusing evaluator.

## Key elements

- **`version: 1`** – schema version for the conformance format.
- **`admin-permissions`** (YAML anchor `&admin_permissions`) – the full tenant-admin key set, defined once and reused via `*admin_permissions` in cases that need "the most privileged tenant caller."
- **`cases`** – the ordered list of conformance scenarios. Each case has:
  - `name` – a one-sentence description of the invariant.
  - `caller` – resolved caller object (`id`, `scope` ∈ {`tenant`, `platform`}, `tenantId`, `permissions[]`).
  - `action` – an action name from `authorization-keys.yaml`.
  - `subject` – the CASL subject type (e.g. `Order`, `Product`, `User`).
  - `resource` – row attributes under test; absent when the question is about the action alone (route-guard semantics).
  - `expect` – `allow` or `deny`.

  Cases are grouped into thematic sections: **scope invariant**, **tenancy**, **ownership**, **visibility**, and **separated actions**.

## Relationships

- **`shared/authorization-keys.yaml`** – every `action` value in a case is one of the keys declared in that file; the conformance suite cannot reference an action that isn't defined there.
- **`shared/authorization-roles.yaml`** – the `admin-permissions` fixture is a hand-maintained copy of the `admin` role's permission list in that file. There is no schema or build-time link; drift between the two is a review-catch, not a machine-catch.

## Notes

- The `admin-permissions` block is synced with `authorization-roles.yaml` **by hand only**. `tests/unit/kernel/permissions.test.ts` validates the real preset role and never this fixture copy, so a key added to one file and not the other will silently diverge.
- `scope` is always exactly `tenant` **or** `platform`, never both. A caller with the wrong-scope key must be denied even if the key name matches (see the "mis-seeded role" cases).
- `resource` being absent means the case models a route-guard question ("may this caller perform the action at all?") rather than a row-level check.
- The file is the single source of truth for cross-backend equivalence: any new authorization rule must be expressed as a case here before either backend implements it, ensuring both sides answer identically.
