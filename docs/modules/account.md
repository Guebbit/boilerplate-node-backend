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
    cart["cart"]
    users["users"]

    cart --> account
    account --> users
    users -. "user.deleted" .-> account
    users -. "user.setup-requested" .-> account

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class cart core;
    class users generic;
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

## Related pages

- [Sessions](./account-sessions.md) — the token mechanics, in detail
- [`users`](./users.md) — the collection this module shares
- [Security](../tools/security.md) — hashing, cookies, and the headers around them
- [Request Flow](../theory/request-flow.md) — where the guard sits in a request
- [Strategic DDD](../theory/strategic-ddd.md#_2-context-map-—-how-a-module-reaches-its-siblings) — what `shared-kernel` costs
