# account

::: tip At a glance
**Owns** — the session: signup, login, refresh, password reset, logout-everywhere, two-step deletion — plus the address book.
**Depends on** — [`users`](./users.md), whose record it authenticates. The repo's only `shared-kernel` edge.
**Breaks if you change** — the token lifetimes or the cookie flags. Every guard in the app resolves through this module.
:::

## Its neighbourhood

<!-- module-graph:account:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    account["account<br/><i>this module</i>"]
    audit_logs["audit-logs"]
    cart["cart"]
    delivery["delivery"]
    feedback["feedback"]
    orders["orders"]
    payments["payments"]
    users["users"]
    wishlist["wishlist"]

    cart --> account
    account --> audit_logs
    account --> cart
    account --> delivery
    account --> feedback
    account --> orders
    account --> payments
    account --> users
    account --> wishlist
    users -. "user.deleted" .-> account
    users -. "user.setup-requested" .-> account

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class cart,orders core;
    class delivery,payments,wishlist supporting;
    class audit_logs,feedback,users generic;
    class account centre;
```

<!-- module-graph:account:end -->

## The story

This module answers the kernel's one question: **who is making this request?** It registers an
auth resolver at import time — not in a boot step — because installing a function touches no
connection, and every guard in the application depends on it existing before the first request
arrives.

It owns exactly one collection, and it is not the one you would guess. The User record belongs to
[`users`](./users.md) and is reached through that module's barrel; what this module owns outright
is the **address book**, one document per account, and a destroyed account takes its book with it
through the same `user.deleted` event the cart and wishlist listen for.

::: tip The barrel is one line wide, and that is the story
The three files in `session/` — JWT signing, cookie shape, the lifetimes both read — used to be
published on the theory that authorization would need them. It does not: `kernel/authentication.ts`
is the port every request goes through, and this module fills it using its own relative imports. No
sibling has ever reached for a token. Issuing this application's tokens _is_ what `account` is, and
none of it is anyone else's business.
:::

What the barrel does publish is `addressForCheckout` — the single address an order ships to. The
address CRUD stays internal, served by this module's own routes. That one function is the whole of
the cart's `customer-supplier` arrow.

## The pipeline

Two tokens with two lifetimes, and the one question the kernel asks on every guarded request.
[Sessions](./account-sessions.md) has the mechanics.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 50}}}%%
flowchart LR
    S["signup"] --> V["verification email"]
    L["login"] --> T["access token<br/><i>short · in memory</i>"]
    L --> RC["refresh cookie<br/><i>long · httpOnly</i>"]
    RC -->|refresh| T
    T --> G["every guarded request<br/><i>the kernel asks, this module answers</i>"]
    LO["logout everywhere"] -.->|revokes| RC
    US["users"] -. "user.setup-requested" .-> SU["setup link sent"]
    US -. "user.deleted" .-> AB["address book emptied"]

    classDef entry fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef token fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class S,L,LO,US entry;
    class T,RC token;
    class V,G,SU,AB done;
```

## Proving an address {#proving-an-address}

Two **kinds** of email verification share one mechanism, and the distinction is the whole design.
One proves the address an account **already has** — signup, and the explicit re-send. The other
proves the address a `PUT /account` change has **asked for**. They are stored under different
`tokens.type` values (`verify` and `email-change`), and neither can do the other's work: a signup
token that could swap in a `pendingEmail` would be an account takeover with an extra step.

A change never writes `user.email` directly. It parks the requested address in `pendingEmail`, so
the account keeps its current, proven address — and its `verified` flag, which describes that
proven address — until the new one is confirmed.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 50}}}%%
flowchart TB
    P["PUT /account<br/><i>email: new@…</i>"] --> C{"which address?"}
    C -->|"the current one"| X["cancels any pending change<br/><i>no mail, no token</i>"]
    C -->|"taken by another account"| R["409<br/><i>email or pendingEmail</i>"]
    C -->|"any other"| W["pendingEmail set"]
    W --> N["notice → OLD address<br/><i>no token, no link that acts</i>"]
    W --> V["verification link → NEW address<br/><i>email-change token · 24h</i>"]
    V --> F["POST /account/email-change-confirm"]
    F --> S["pendingEmail → email<br/>verified = true<br/>refresh tokens revoked"]

    classDef entry fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef warn fill:#fee2e2,stroke:#dc2626,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class P,F entry;
    class R,N warn;
    class X,W,V,S done;
```

Three things in that diagram are decisions rather than mechanics:

- **The notice goes to the old address when the change is _requested_, not when it completes.** A
  warning that arrives before a takeover is a warning; one that arrives after is a receipt. It
  carries no token and no link that acts — "this wasn't me" is a password change and a
  logout-everywhere, both of which already exist.
- **Re-typing the current address cancels a pending change.** Cheaper than a dedicated endpoint,
  and it is what a user who changed their mind would naturally do.
- **Confirming revokes every refresh token.** An email change is the stronger takeover primitive
  of the two, and this is the same treatment a changed password already gets.

Collision is checked twice, because the two checks catch different things. At **request time**,
the requested address is compared against every account's `email` _and_ `pendingEmail`. At **swap
time**, the `users_email` and `users_pending_email` unique indexes catch whatever changed in the
up-to-24-hours between the two.

## Related pages

- [Sessions](./account-sessions.md) — the token mechanics, in detail
- [`users`](./users.md) — the collection this module shares
- [Security](../tools/security.md) — hashing, cookies, and the headers around them
- [Request Flow](../theory/request-flow.md) — where the guard sits in a request
- [Strategic DDD](../theory/strategic-ddd.md#_2-context-map-—-how-a-module-reaches-its-siblings) — what `shared-kernel` costs
