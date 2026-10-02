---
source: shared/authorization-conformance.yaml
sha256: 214dd9364b49ebc81e2b75de59925b7c688b8a79393357b1fc6d67b4cc7bcc7a
generated_at: 2026-10-01T12:42:11.544432+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-conformance.yaml

## Purpose

A cross-backend conformance fixture listing authorization cases that the Node (CASL) and PHP Laravel (`spatie/laravel-permission`) implementations must answer identically. Committed byte-for-byte in both `boilerplate-node-backend` and `boilerplate-php-laravel-backend`, it pins the semantic contract between the two evaluators: any case that passes in one and fails in the other is a bug. The file is deny-case-centric — every `allow` exists only as a control that proves a neighbouring `deny` was earned by the rule rather than by a broken evaluator.

## Key elements

- **`version`** — schema version (currently `1`); bump when the case format changes.
- **`admin-permissions`** (`&admin_permissions`) — YAML anchor holding the full tenant-admin key list (47 keys). Reused via `*admin_permissions` in cases that need "the most privileged tenant caller." Manually kept in sync with the `admin` role in `authorization-roles.yaml`; no automated link exists between the two.
- **`cases`** — ordered list of conformance cases. Each case has:
  - `name` — a plain-English sentence describing the assertion.
  - `caller` — `{ id, scope: tenant|platform, tenantId, permissions[] }`. `id` may be `null` (guest). `scope` is always one value, never both.
  - `action` — one of the verbs defined in `authorization-keys.yaml`.
  - `subject` — the CASL subject type (e.g. `Order`, `Product`, `Payment`).
  - `resource` — row attributes relevant to the decision. Omitted means the question is about the action alone (a route-guard scenario with no specific row).
  - `expect` — `allow` or `deny`.

## Relationships

- **`shared/authorization-keys.yaml`** — Defines the closed set of action verbs and permission keys that every `action` and `permissions[]` entry in this file must reference. This file is the consumer; the keys file is the vocabulary.
- **`shared/authorization-roles.yaml`** — Defines the preset roles (including `admin`) whose permission lists this file's `admin-permissions` anchor mirrors by hand. There is no import or schema link; drift between the two is a review-time concern, not a compile-time one.

## Notes

- **Manual sync of `admin-permissions`.** Adding a key to the `admin` role in `authorization-roles.yaml` without updating this anchor (or vice-versa) will not fail any test — `tests/unit/kernel/permissions.test.ts` only validates the real preset role, never this fixture copy. Review both files together when touching the admin permission set.
- **Deny is the test; allow is the control.** The file's own header states that a suite of only happy paths is worthless. When adding a new `deny` case, pair it with the corresponding `allow` so a regression to "deny everything" is caught.
- **`resource: {}` is intentional.** An empty resource map means "no row attributes available" (route-guard level), not "all attributes default." Do not replace it with `null` or omit the key.
- **One caller, one scope, one tenant per case.** A caller who belongs to two shops is tested as two separate cases (see the `usr_2` pair under Tenancy). Never encode multi-tenancy in a single case.
- **The file is the spec.** Both backends are required to produce the same `allow`/`deny` for every case. If a case seems wrong, fix the case here first, then align implementations — not the other way around.
