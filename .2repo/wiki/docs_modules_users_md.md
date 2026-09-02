# docs/modules/users.md

## Purpose

Documents the `users` module — the owner of the user record (email, password hash, admin flag, and the reset/refresh token subdocument) and its repository. It is a dependency-free leaf in the module graph; five sibling modules import it, and it imports none. Authentication is deliberately *not* here; that logic lives in `account`, a second service over the same collection.

## Key elements

- **User record** — email, password hash, `admin` flag, `tokens` subdocument. The only field other modules touch is `tokens`, making it the repo's sole shared-kernel edge.
- **Barrel exports** — publishes the *model* and the *repository* (not just a service), because `account` must write the record directly.
- **`user.deleted` event** — fired on hard delete; listeners in `cart`, `orders`, `payments`, `wishlist` clean up their own data. Keeps the module a leaf (no inbound imports for the cascade).
- **`user.setup-requested` event** — fired toward `account`, which then sends a setup link.
- **Soft delete** — `DELETE /users/:id` stamps `deletedAt`; a second call restores. No event, no cascade.
- **Hard delete** — `?hardDelete=true` removes the row and fires `user.deleted`. The only path that discharges an Art. 17 erasure request.
- **Audit distinction** — soft emits `admin.user.soft_deleted`; hard emits `admin.user.erased`. Two separate actions so the log alone answers whether an erasure request was closed out.

## Relationships

- **`account`** (docs/modules/account.md) — second service over the same collection. Reads and writes the `tokens` subdocument. Consumes both `user.deleted` (empties address book) and `user.setup-requested` (sends setup link).
- **`cart` / `cart-checkout`** — imports the user model; listens to `user.deleted` to empty the cart.
- **`wishlist`** — imports the user model; listens to `user.deleted` to empty the wishlist.
- **`orders`** — imports the user model; listens to `user.deleted` for cleanup.
- **`payments`** — imports the user model; listens to `user.deleted` for cleanup.
- **`delivery`** — imports the user model (listed in the neighbourhood diagram).
- **`strategic-ddd`** (docs/theory/strategic-ddd.md) — explains why the wide barrel is a visible map edge rather than a private implementation detail.
- **`security`** (docs/tools/security.md) — documents the password-hashing scheme and token shapes stored on the record.
- **`events-and-logging`** (docs/tools/events-and-logging.md) — catalogues `user.deleted` and its three downstream listeners.
- **`index`** (docs/modules/index.md) — parent context map where this module appears as the `centre`-styled leaf node.

## Notes

- **No aggregate lives here.** The record is `generic` (shared vocabulary, no domain-specific invariants). Central as it feels, it stays a leaf rather than becoming a Bounded Context of its own.
- **Two modules, one collection — by design.** `/users` and `/account` are separate URL mounts; a manifest carries one `basePath`, so merging would collapse two surfaces for no gain. The cost of the split is one visible shared-kernel arrow, not hidden coupling.
- **Soft ≠ hard, and the log proves it.** Don't conflate the two audit actions. Only the hard path satisfies a GDPR Art. 17 request; the soft path is a reversible toggle with no downstream effect.
- **The `tokens` subdocument is the only field `account` writes.** If its shape changes, `account` breaks — this is the single point of cross-module fragility.
