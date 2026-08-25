# users

::: tip At a glance
**Owns** — the user record: email, password hash, admin flag, and the reset/refresh tokens hanging off it.
**Depends on** — nothing. Authentication is next door in [`account`](./account.md).
**Breaks if you change** — the `tokens` subdocument. `account` reads and writes it, and it is the repo's only shared-kernel edge.
:::

## The story

A user record with an email, a password hash and an admin flag is the same problem in every
application that has ever had one. Nothing about it differentiates this shop — which is exactly
what `generic` means, and why no aggregate belongs here however central the record feels.

**Authentication is not here.** Signup, login, password reset and the token lifecycle all live in
[`account`](./account.md), which is a _second service over this same collection_. That split is why
this module's barrel is the widest in the repo: it publishes the model and the repository, not just
the service, because a sibling genuinely needs to write the record.

::: tip Why two modules and not one
`/users` and `/account` are different mounts, and a manifest carries one `basePath`. Merging them
would collapse two URL surfaces into one module for no gain — and the cost of keeping them apart is
visible on the map as a `shared-kernel` arrow rather than hidden inside a barrel.
:::

Five modules depend on this one and it depends on none, so it sits at the bottom of the graph.
Deleting an account has to empty that user's cart and wishlist, and that travels as `user.deleted`
for the same reason products uses an event: it keeps this module a leaf.

## Related pages

- [Modules overview](./index.md) — the whole context map
- [`account`](./account.md) — the other service over this collection
- [Strategic DDD](../theory/strategic-ddd.md#_5-published-language-—-the-barrel-held-to-a-size) — why a wide barrel is a map edge, not a private detail
- [Security](../tools/security.md) — password hashing and the token shapes
- [Events & Logging](../tools/events-and-logging.md) — `user.deleted` and its three listeners
