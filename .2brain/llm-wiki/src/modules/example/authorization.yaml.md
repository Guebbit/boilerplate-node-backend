---
source: src/modules/example/authorization.yaml
source_sha256: 2b6983672d3e63795c7c1f2d42ad82cb8fce1cad40652cd8c95c6cfd0890a083
context_sha256: 508d566fa49e375b1f4a1205904a1ac81bc14c9114dbb317bee86069027c353f
generated_at: 2026-11-22T05:06:41.053421+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/authorization.yaml

## Purpose
Declares the authorization rules and rule sets for the `example` module's `Example` subject. It is a template/sample module: the header comment notes that deleting this file along with the module removes its rules and sets too.

## Key elements
- **`rules`**: six rules on subject `Example`, all with `module: example`, `scope: tenant`, `credential: false`:
  - `read`: the caller's own examples, drafts included (condition `userId: $caller.id`).
  - `create`: write a new example of one's own (no condition).
  - `update`: edit the caller's own examples and move them through draft, published and archived (condition `userId: $caller.id`).
  - `delete`: remove the caller's own examples (condition `userId: $caller.id`).
  - `display`: read every example, whoever owns it (staff door, no condition).
  - `admin`: edit or remove any example, whoever owns it (staff door, no condition).
- **`sets`**: named bundles of rules, referenced as `action:Subject`:
  - `ExampleAuthoring`: `read`, `create`, `update`, `delete`. Described as staff-only, since a shopper authors no storefront content.
  - `ExampleDisplay`: `display`. Described as read every example and edit only one's own.
  - `ExampleManagement`: `display` and `admin`. Described as read, edit and remove every example.

## Relationships
- `src/modules/delivery/authorization.yaml` is a sibling module's authorization file. The content here shows no explicit reference to it.

## Notes
- The plain actions (`read`, `update`, `delete`) are limited to the caller's own rows. The condition `userId: $caller.id` is applied to the query.
- `display` and `admin` are the unconditioned "staff doors". An admin holds both, which is why `ExampleManagement` lists both.
- `ExampleDisplay` contains only `display`, so its description's "edit only one's own" depends on also holding the plain `update` rule. That rule is in `ExampleAuthoring`, not in this set.
