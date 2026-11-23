---
source: shared/cases/authorization.cases.yaml
source_sha256: 1b0d42a55908dcd8771a26bdadab288888cc04da0a1f62f160909f8a16f873ba
context_sha256: aa1a45305408ddcbc864618779cff1c86ed62013ac3c3d89cdb8cde985a4cf14
generated_at: 2026-11-22T02:20:54.304158+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/authorization.cases.yaml

## Purpose
A shared, language-neutral table of authorization test cases that both backends (`boilerplate-node-backend` with CASL, and `boilerplate-php-laravel-backend` with an evaluator over `spatie/laravel-permission`) must answer identically. The file is committed byte-for-byte in both repositories, and each runs every case against its own implementation. It is deny-heavy by design: each `allow` exists only as a control proving that its neighbouring `deny` came from the rule and not from an evaluator that refuses everything.

## Key elements
- **`version: 1`** and a top-level **`cases:`** list.
- **Case shape**, where each case is one sentence-style `name` plus:
  - `caller`: the resolved caller. It has `id` (may be `null` for a guest), `scope` (`tenant` or `platform`, never both) and `tenantId` (`null` for platform). It holds rules either as a raw `permissions` list (to pin a single rule) or as a preset `role` plus optional `audience`, which each side expands from `shared/rules/authorization-roles.yaml`.
  - `action`: one of the actions in `authorization-keys.generated.yaml`.
  - `subject`: the CASL subject type, e.g. `Order`, `Product`, `Payment`, `Refund`, `Example`, `Locale`, `ObservabilitySnapshot`.
  - `resource`: the row's attributes, such as `tenantId`, `userId` and `active`. If absent, the case asks about the action alone, as a route guard does.
  - `expect`: `allow` or `deny`.
- **Case groups** (section comments):
  - Scope invariant: platform vs tenant. This includes a `manage` wildcard that never satisfies a bare `manage`, and mis-seeded wrong-scope rules that must be inert.
  - Tenancy: cross-shop access is denied.
  - Ownership: `read:Order` and `read:Payment` cover own rows only, while `display:*` rules read all rows. The `Example` module covers `update` on own rows vs `admin` on any row.
  - Visibility: guests and customers see only active `Product` and `Locale` rows, while `display:Product` also sees inactive rows.
  - Separated actions: the section begins with a comment on what `write` could not express. The visible content covers cases such as `export` and `create:Refund`.

## Relationships
- `shared/authorization-keys.generated.yaml`: defines the valid action set that each case's `action` must come from.
- `shared/rules/authorization-roles.yaml`: the source that role-based cases (`role: admin`, `audience: customer`) are expanded from, so those cases follow the product when a role changes.

## Notes
- Cases are kept as one-sentence claims. A case that needs a paragraph to explain signals that the model is wrong.
- Raw-`permissions` cases pin a specific rule, while `role` cases track the role definitions.
- A caller with `id: null` and `userId: null` on the resource must still be denied: owning nothing grants nothing.
- Because the file is duplicated in both repositories, edits must be made identically in both.
