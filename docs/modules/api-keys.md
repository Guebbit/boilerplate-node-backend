# api-keys

::: tip At a glance
**Owns** — machine-to-machine credentials: mint, list, revoke, and the `CredentialResolver` that
lets an `sk_...` bearer token authenticate a request the way a JWT does.
**Depends on** — [`users`](./users.md), for the minting user's account and current role — the same
dependency `account` itself already has.
**Breaks if you change** — the `sk_` token prefix (`kernel/authentication.ts`'s dispatch between
this module's credential path and `account`'s JWT path assumes it), or the mint-time/check-time
permission-floor pair in `services/api-keys.ts` and `module.ts`.
:::

## Its neighbourhood

<!-- module-graph:api-keys:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    api_keys["api-keys<br/><i>this module</i>"]
    access["access"]
    account["account"]
    users["users"]

    api_keys --> access
    api_keys --> account
    api_keys --> users
    account -. "account.sessions-revoked" .-> api_keys

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class access,account,users generic;
    class api_keys centre;
```

<!-- module-graph:api-keys:end -->

## The story

A partner integration, or a webhook consumer calling back into this shop's own API, has nothing to
present today short of a person's password — which then appears in the audit trail as that person,
and carries their whole reach rather than the two endpoints the partner needs. This module is the
answer: a revocable credential, scoped to a caller-chosen subset of whoever minted it.

**The credential is verified, never decrypted.** `sk_<8-char prefix>_<32 bytes>`, both halves
`base64url`. Only a sha256 digest is ever stored — `credentials.ts` reuses `hashToken`
(`@modules/users`), the same one-way primitive refresh/reset tokens use: a high-entropy, one-time
secret has no search space for bcrypt/argon2 to make expensive, so the ~100ms they would cost on
every authenticated request buys nothing. The prefix is the only part ever stored in the clear —
it is what turns verification into one indexed lookup instead of a collection scan, and it is not
secret.

**A key holds a subset of the minter's permissions, floored TWICE.** Once at mint time
(`services/api-keys.ts#isMintable`, against what the requesting caller holds right now), and again
on every single use (`module.ts`'s `CredentialResolver`, re-deriving the minter's CURRENT
permissions and intersecting them against the key's stored snapshot). The second floor is the one
that matters after the fact: demote or delete the person who minted a key, and every key they ever
minted shrinks or dies with them — without the credential document itself ever being touched.

```mermaid
flowchart LR
    REQ["Authorization: Bearer sk_..."] --> DISPATCH{"sk_ prefix?"}
    DISPATCH -->|no| JWT["account's JWT path"]
    DISPATCH -->|yes| LOOKUP["findActiveByPrefix"]
    LOOKUP --> HASH{"hash matches?"}
    HASH -->|no| REJECT["401"]
    HASH -->|yes| FLOOR["re-derive minter's CURRENT permissions"]
    FLOOR --> INTERSECT["stored permissions ∩ current permissions"]
    INTERSECT --> CALLER["Caller, tenant-scoped"]
```

**A key outlives its session, so three rules bound it.**

```mermaid
flowchart LR
    M["POST /api-keys"] --> F{"fresh critical session?"}
    F -->|no| R["401 REAUTH_REQUIRED"]
    F -->|yes| E{"expiresAt ≤ 1 year ahead?"}
    E -->|no| U["422"]
    E -->|yes| K["key minted · minter mailed"]
    L["logout everywhere /<br/>password reset"] --> V["account.sessions-revoked"]
    V --> X["every live key the person minted revoked · list mailed"]
```

- **Minting needs a fresh session** (`stepUp: critical` on `apikeys.any.create`): a stolen access
  token must not turn ten minutes into a long-lived key. GitHub's sudo mode asks the same.
- **Every key expires**, at most one year out. A key that never expires never gets rotated.
- **The minter is mailed** when a key is created, and again — with the list — when logout-everywhere
  or a password reset revoked them. `account` only announces the event; this module owns what it
  means for keys. An ordinary password change, where the owner typed the current password, leaves
  keys alone.

**Tenant-scoped only, by design.** This repo's own deployment model is a silo — one organisation
per stack, never pooled multi-tenancy — so every real use case for a machine credential (a partner,
a webhook consumer calling back) is shop-level. A platform-scoped credential would exist for
automating this ONE installation's own ops surface, and that need is already served by the static
`NODE_METRICS_TOKEN` bearer credential — building a second, per-key mechanism for a need nobody has
stated would be scope nobody asked for.

::: tip What deleting this module actually costs
Every ingredient it is built from — `kernel/authentication.ts`'s `CredentialResolver` port,
`hashToken`, the permission model — is still there and still used by whatever remains. Deleting
`api-keys` simply means no build serves `sk_...` tokens: `resolveCredential` resolves `undefined`
for one instead of throwing, exactly like a build with no `account` has no JWTs to verify.
:::

## Managing it

**Revoking is not ranked.** Any holder of `apikeys.any.delete` revokes any key in the tenant, a
fellow administrator's included: revoking only takes access away, so the
[rank rule](../theory/authorization.md#acting-on-someone-else-s-things) has nothing to guard, and
no administrator outranks another. Banning a compromised administrator is still a technician's
edit of the database, [by decision](../theory/authorization.md#acting-on-someone-else-s-things).

Minting, listing and revoking a credential all have an admin screen now, in the paired
`boilerplate-vue-frontend` — `api-keys` there, its own two routes over this module's three
endpoints. "Usable via any HTTP client" is still true (nothing here requires the UI), but no longer
the only way in. See that repo's `docs/modules/api-keys.md` for the client side, including why the
permissions field is free text rather than a picker.

See: [Security](../tools/security.md#machine-to-machine-credentials),
[Authorization theory](../theory/authorization.md).
