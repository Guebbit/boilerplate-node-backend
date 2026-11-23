---
source: src/modules/cart/authorization.yaml
generated_at: 2026-11-22T04:29:54.988323+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/authorization.yaml

## Purpose
Declares the single authorization rule for the `cart` module and a permission set that wraps it. A basket is otherwise ruleless (every signed-in account can use one, staff included). Spending it, meaning placing an order and starting payment, is gated on a fact about the account, so an unverified email cannot check out.

## Key elements
- **Rule `checkout` on `Cart`**: `module: cart`, `scope: tenant`. It covers spending the caller's own basket, which places an order and starts paying for it.
  - `deniedCode: EMAIL_NOT_VERIFIED`: the 403 keeps this specific wording instead of the generic `requirePermission` message. The comment says the i18n key is `t('generic.error-<deniedCode, kebab-cased>')`.
- **Set `CartCheckout`** (`module: cart`): bundles the single rule `checkout:Cart`.

## Relationships
- `src/modules/cart/openapi.yaml` is the only graph neighbor. The file content shows no explicit reference to it, so this page does not describe any direct interaction.

## Notes
- Basket contents (add, remove, set quantity) deliberately have no rules.
- The action is named `checkout` rather than `create` on `Order`. `create:Order` already means "raise an order on someone else's behalf", and reusing it would produce an identical CASL tuple that cannot be told apart once packed for the browser.
- The rule is tied to the account (email verification), so it lives on a rule rather than on a route mount.
- The header comment points to `docs/understand/authorization.md` for background.
