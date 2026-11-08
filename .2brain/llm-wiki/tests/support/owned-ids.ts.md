---
source: tests/support/owned-ids.ts
sha256: de6eb414543e2781741628c07657843384b34eaaeee4a3c8798ee31f85413e57
generated_at: 2026-11-08T09:56:43.929541+00:00
model: ollama:qwen3.8:27b
---

# tests/support/owned-ids.ts

## Purpose
Classifies every customer-facing ID that can appear in a request (path parameter, body field, or query filter) into ownership categories. The two ownership contract sweeps consume these lists as their single source of truth: each `OWNED_*` entry is held to one claim — a foreign customer's ID must answer exactly like a nonexistent one.

## Key elements
- **`OwnedId`** — interface with `key` (route + field, in the defined key shape) and `module` (folder under `src/modules/` that mounts the route).
- **`of(module, keys)`** — private helper that builds an `OwnedId[]` for one module.
- **`NOT_AN_OWNED_ID`** — IDs that reference no customer-owned row (method names, provider names, public product IDs). A foreign ID here is structurally unreachable.
- **`NOT_AN_ID_BY_NAME`** — request fields whose name matches `*Id` but are not typed `Id` (e.g. `shippingMethodId`); excluded from the owned-ID tripwire.
- **`OWNED_PATH`** — path-parameter IDs where a foreign row must return 404.
- **`OWNED_BODY`** — body IDs where a foreign row must return the documented "missing" status.
- **`OWNED_FILTER`** — list-filter IDs where a foreign value must narrow the result to an empty page.
- **`FAMILIES`** — `as const` aggregate of the four lists above, keyed by family name, used by the completeness check.

## Relationships
- **`tests/contract/ownership-contract.test.ts`** — imports the lists and asserts, for every `OWNED_*` entry, that substituting another customer's ID yields the same response as a nonexistent ID.
- **`tests/contract/ownership-shop.contract.test.ts`** — same contract sweep in the shop context; consumes the same `FAMILIES` export.
- The completeness check (run from the tests) derives every ID from mounted routes and `openapi.yaml`, then cross-references against these lists; it fails if a derived ID is absent from every list or a listed entry is no longer derivable.

## Notes
- **Zero imports by design.** `demo:remove` strips shop modules, and this file must survive that. The `module` field is the mechanism: when a module is removed, its entries are dropped from the derived set, so the check passes rather than failing on a stale entry.
- **Key shapes are fixed:** path IDs use `METHOD /path/:param` (no trailing slash); body/query IDs use `METHOD /path#field`, with `[]` marking array elements (e.g. `lines[].productId`).
- **Manual curation, automatic verification.** The lists are maintained by hand; the completeness check is automatic and will flag both missing entries and entries that no longer correspond to a real route/field.
