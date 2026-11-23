---
source: src/modules/shop/index.ts
source_sha256: 93b8b77b6ed6944ba442f2429535fbe8e0d422db19b97b0be9b69eb396d3fb1f
context_sha256: 1a0f9b800fa502b0c55bd27c381c89ae10a589e6c5b2ee056819b4a19b46762f
generated_at: 2026-11-22T07:46:57.040900+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/index.ts

## Purpose
Public barrel for the shop module. It is the only surface a sibling module may import from shop. Per its header comment, the module's domain is the readers, which siblings call instead of reading the config themselves. The config slice and the manifest are wiring and are deliberately not published here.

## Key elements
- `export * from './service'`: the file's only statement. It re-exports everything the shop `service` module exposes, and that is the module's entire public API.

## Relationships
The neighbors listed are cart and delivery files. They sit in the dependency graph around this barrel, and the barrel's role is to be the import point for sibling modules.
- **Cart**: `src/modules/cart/services/checkout.ts`, `src/modules/cart/services/view.ts`, and the integration tests `src/modules/cart/tests/integration/backorder.test.ts` and `src/modules/cart/tests/integration/preorder.test.ts`.
- **Delivery**: `src/modules/delivery/controllers/get-date-impact.ts`, `src/modules/delivery/emails.ts`, `src/modules/delivery/presenter.ts`, `src/modules/delivery/tests/factories.ts`, the contract test `src/modules/delivery/tests/contract/api.contract.test.ts`, and the services `src/modules/delivery/services/announce.ts`, `ensure.ts`, `owed.ts`, `process.ts`, `release-date-impact.ts` and `slip.ts`.
- The file itself shows no import or usage details for these neighbors. It only re-exports `./service`.

## Notes
- Sibling modules should import from this barrel, not from `./service` or other shop internals.
- Don't add config or manifest exports here. The header says a barrel never publishes them.
- The header's `@see` references point to documentation on the "published language" barrel pattern and the shop module's neighbourhood, which explain the rationale.
