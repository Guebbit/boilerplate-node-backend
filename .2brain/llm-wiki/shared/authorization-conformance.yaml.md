---
source: shared/authorization-conformance.yaml
sha256: 865cf90a1e8823920c5eb38fa906ead338ebc271ec93f0eebd26f65ae7a34cbc
generated_at: 2026-09-23T17:32:57.594589+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-conformance.yaml

## Purpose

A cross-backend conformance suite that pins the exact authorization decisions both backends (Node/CASL and PHP/Laravel/spatie) must return for the same set of caller–action–subject–resource tuples. It exists so that "correct" has a single, byte-identical definition in two codebases, and so that deny cases (not just happy paths) are guaranteed to be exercised.

## Key elements

- **`version`** — schema version marker (currently `1`); both backends key their parser on this.
- **`admin-permissions`** (YAML anchor `&admin_permissions`) — the full list of tenant-scope keys an `admin` holds, referenced via `*admin_permissions` in cases that need "the most privileged tenant caller." Kept identical to the `admin` entry in `authorization-roles.yaml` **by hand**; no schema link enforces this.
- **`cases`** — array of conformance records, each with:
    - `name` — human-readable sentence describing the rule under test.
    - `caller` — resolved caller object (`id`, `scope` = `tenant`|`platform`, `tenantId`, `permissions`).
    - `action` — one of the keys defined in `authorization-keys.yaml` (e.g. `read`, `create`, `update`, `delete`, `manage`).
    - `subject` — CASL subject type (e.g. `Order`, `Product`, `ObservabilitySnapshot`).
    - `resource` — row attributes; absent means the question is about the action alone (route-guard level).
    - `expect` — `allow` | `deny`.

## Relationships

- **`shared/authorization-keys.yaml`** — every `action` value in a case must be a key declared there; this file tests the _model_ built on those keys, not the key list itself.
- **`shared/authorization-roles.yaml`** — the `admin-permissions` anchor in this file mirrors the `admin` role's key set in that file. There is no machine-enforced link; drift is a review problem, not a CI failure (the only automated check, `tests/unit/kernel/permissions.test.ts`, validates the real preset role, not this fixture copy).

## Notes

- The file is committed with **identical bytes** in `boilerplate-node-backend` and `boilerplate-php-laravel-backend`; treat it as a shared contract, not a per-repo config.
- Every `allow` case is intentionally paired with a neighbouring `deny` as a control — a suite of only-allow cases would pass under an evaluator that denies everything.
- `scope` is always exactly one of `tenant` or `platform`; cases where a caller carries a key from the _other_ scope verify that the key is **inert**, not merely unreachable.
- `resource` being absent (or `{}`) means the test asks "may this caller perform the action at all?" (route-guard semantics), whereas a populated `resource` asks "may this caller perform the action _on this row_?"
- The `admin-permissions` list and `authorization-roles.yaml`'s `admin` entry are maintained in lockstep manually. Adding a key to one without the other will not be caught by any existing test.
- The file is truncated in the graph snapshot; the full version contains additional cases in the "separated actions" and subsequent sections (e.g. `inventory`, `delivery`, `tokens`, `audit`, `webhooks`, `apikeys`).
