---
source: src/modules/example/authorization.yaml
sha256: 2b6983672d3e63795c7c1f2d42ad82cb8fce1cad40652cd8c95c6cfd0890a083
generated_at: 2026-11-08T05:48:05.928956+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/authorization.yaml

## Purpose
Declares the authorization rules and rule sets for the `example` module. It defines which actions a caller may perform on `Example` rows, distinguishing self-scoped operations (bound to `$caller.id`) from cross-user "staff" operations (`display`, `admin`), and groups them into assignable sets.

## Key elements
- **`rules`** — Six action entries, all tenant-scoped, all `credential: false`:
  - `read`, `update`, `delete` — self-scoped via `userId: $caller.id` condition; the condition rides into the query so the caller only touches their own rows.
  - `create` — no condition; the caller writes a new row that is implicitly theirs.
  - `display` — read every `Example` row regardless of owner (staff door).
  - `admin` — edit or remove any `Example` row regardless of owner (staff door); an admin holds both `display` and `admin`.
- **`sets`** — Three named groupings for assignment to roles/principals:
  - `ExampleAuthoring` — the four self-scoped actions (read, create, update, delete).
  - `ExampleDisplay` — `display:Example` only.
  - `ExampleManagement` — `display:Example` + `admin:Example`.

## Relationships
- **`src/modules/example/module.ts`** — The module these rules and sets belong to (`module: example`). Deleting the module removes this file along with all its rules and sets.
- **`src/modules/delivery/authorization.yaml`** — Sibling authorization file; follows the same structural conventions (rules with conditions, sets referencing `module`-prefixed action:subject pairs).

## Notes
- Self-scoping is done via the `conditions.userId: $caller.id` field, not via a separate ACL check. The condition is injected into the data query at read time.
- `credential: false` on every rule means no additional credential (API key, token, etc.) is required beyond the caller identity already resolved upstream.
- The sets are intentionally small and orthogonal: `ExampleAuthoring` excludes staff actions; `ExampleManagement` implies `ExampleDisplay`. Assign both for full access.
- Per the in-file comment, this file is meant to be deleted together with the `example` module — it carries no standalone runtime role.
