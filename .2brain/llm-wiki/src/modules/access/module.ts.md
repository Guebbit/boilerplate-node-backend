---
source: src/modules/access/module.ts
sha256: a20b86b511ef91a9346ebcc71ef056f963704a72d40a4e243a298c02c7730525
generated_at: 2026-10-14T08:26:10.270756+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/module.ts

## Purpose

Defines the **access** module's manifest (a single default-exported object satisfying `AppModule`) for the tenant-and-membership domain. It is intentionally routeless: no endpoint creates a shop or grants a role, so the module exists purely to declare its personal-data obligations (GDPR Art. 15 collect/erase) and to act as the barrel through which other modules consume membership data.

## Key elements

- **`export default { … } satisfies AppModule`** — the module manifest.
  - `name: 'access'` — registry identifier.
  - `personalData[0]` (section `"roles"`)
    - `collect(subject)` — calls `membershipsOf(subject.userId)` and maps each membership to `{ role, scope }`. Deliberately omits the tenant id (single-shop deployment; role/scope alone answer Art. 15's "what can this account do").
    - `erase` — aliased to `eraseMemberships`; joins the caller's hard-delete transaction to remove the subject's membership rows.
- **Imports** — `AppModule` type from `@kernel/registry`; `eraseMemberships`, `membershipsOf` from `./service`.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type that the default export satisfies; the registry is what reads this manifest at boot.
- **`src/modules/access/service.ts`** — provides the two functions (`membershipsOf`, `eraseMemberships`) that the `collect` and `erase` callbacks delegate to. This file is the thin declarative wrapper; the service holds the actual data-access logic.
- **`src/modules.ts`** — top-level module index that registers `access` alongside the other domain modules so the kernel can resolve it.
- **`src/modules/account/module.ts`** / **`src/modules/account/openapi.yaml`** — the account module is one of the documented consumers of the access barrel (the file header lists `account`, `api-keys`, `example`, `orders`, `payments`, `returns`, `users` as consumers). The account module's OpenAPI spec defines the account-facing surface that ultimately depends on membership data exposed here.

## Notes

- The module is **routeless by design**. If you need an HTTP endpoint for tenant/membership mutations, it does not exist in this codebase; the file header explicitly states none is planned in the boilerplate.
- `collect` returns only `role` + `scope`. Do not add the tenant id — the comment explains it is intentionally omitted for a single-tenant deployment and because Art. 15 only requires the permission summary.
- `erase` is a **hard delete** (not soft). It is expected to run inside the caller's existing transaction; it does not open its own.
