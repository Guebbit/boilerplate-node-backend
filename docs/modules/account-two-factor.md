# Two-factor authentication

The second factor's **structure** — the registry, the state machine, and what a user document
carries. [Security](../tools/security.md#two-factor-authentication) covers the same subsystem from
the attacker's side: the crypto at rest, the controls, and what is honestly not covered.

::: tip At a glance
**The shape** — `registry.ts` declares the port, `methods/*.ts` implement it one channel per file,
`totp.ts` / `delivered-codes.ts` / `backup-codes.ts` hold the crypto behind them, `index.ts` is the
module-internal barrel.
**Published** — nothing. No sibling imports it. There is no admin recovery path: a lost factor is
a technician's hand edit in the database.
**Breaks if you change** — `TwoFactorMethodRecord`. One shape serves every method, so a new field
is a schema change in `users`, not here.
:::

## A registry, not a branch

Gaining a channel means adding a handler. Everything above `registry.ts` — services, controllers,
the contract — deals in a `method` string and a handler looked up from it, so no login-flow
`switch` grows a third arm.

| Member          | What it answers                                                       |
| --------------- | --------------------------------------------------------------------- |
| `name`          | the wire name, stored on the entry and carried by the contract        |
| `delivers`      | does the server send the code, or does a device derive it?            |
| `available()`   | can this **deployment** run the method at all?                        |
| `eligibility()` | may this **account** enroll it — a verified address, a verified phone |
| `target()`      | the masked destination, so no client has to redact one                |
| `setup()`       | arm whatever the caller needs to produce a first code                 |
| `verify()`      | check a typed code, advancing the replay guard or burning the code    |
| `send?()`       | deliver a fresh code — present exactly when `delivers` is true        |

::: warning Handlers never touch the database
A handler mutates the entry it is handed and returns. Persisting is the calling service's job,
which is what lets **one** save cover the factor, the backup codes and the account flag together —
three writes could half-apply and leave an account whose flag says "armed" and whose methods say
otherwise.
:::

Two ship. `HANDLERS` declares their order, and that order is the client's offer order — a device
method first, because it costs no round-trip and no mailbox:

| Method  | `delivers` | `available()` when                        |
| ------- | ---------- | ----------------------------------------- |
| `totp`  | no         | always — it needs no channel and no proof |
| `email` | yes        | SMTP is configured                        |

`twoFactorMethod(name)` answers `undefined` for an unknown method **and** for one this deployment
has switched off. One answer for two cases, on purpose: a caller learns nothing from being told a
channel exists but is unavailable.

## Enrollment is two steps, and the halfway state is real

`enrolledAt` is the whole distinction. Setup arms a secret so the caller can produce a code;
nothing guards a login until a code proves the caller actually received it.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 32, 'rankSpacing': 46}}}%%
flowchart LR
    N["no entry"] --> S["POST .../setup<br/><i>secret armed, enrolledAt ABSENT</i>"]
    S --> C["POST .../confirm<br/><i>a right code sets enrolledAt</i>"]
    C --> A["armed — guards every login"]
    S -.->|"abandoned"| S
    A --> D["DELETE .../methods/:method<br/><i>this one only</i>"]
    A --> X["DELETE /account/2fa<br/><i>all of them, plus the codes</i>"]

    classDef half fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef ok fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef gone fill:#fee2e2,stroke:#dc2626,color:#111827;
    class S half;
    class A,C ok;
    class D,X gone;
```

A half-enrolled entry is **ignored by login**, not cleaned up: re-running setup overwrites it, and
a fresh secret resets `lastUsedStep` too — the old high-water mark belongs to a secret that no
longer exists, and keeping it would refuse the first valid code.

## What the user document carries

The fields live on [`users`](./users.md)' `User`, because that is the account record. This module
is the only writer.

Why they stay there rather than in a collection of their own: they are **bounded** (a handful of
entries and ten digests), **read at every login** next to the password hash, and **die with the
user**, so a second collection would add a join and a deletion step for nothing. The races that
motivated asking were not about storage, so they are fixed in the write below. Revisit when a
factor can be many per account, such as passkeys.

| Field                     | Holds                                            | On the contract?                          |
| ------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `twoFactorMethods[]`      | one `TwoFactorMethodRecord` per method           | no — `select: false` credential material  |
| `twoFactorBackupCodes[]`  | salted scrypt of ten one-time codes              | no — same                                 |
| `twoFactorBackupCodeSalt` | the one salt every entry above is scrypt'd under | no — same                                 |
| `twoFactorEnabledAt`      | when the account first armed anything            | **yes**, the only 2FA field a client sees |

One record shape serves every method, rather than a collection per channel: a deployment that
gains a channel adds a handler, not a migration. Device fields (`secret`, `lastUsedStep`) and
delivered fields (`codeHash`, `codeExpiresAt`, `codeSentAt`, `codeAttempts`) are all optional on
the same record, and which half a method uses follows from its `delivers`.

## Concurrent writes

Two requests on one account run side by side: a login that is mailing a code, a confirm, a TOTP
check. A `save()` of the whole `twoFactorMethods` array would let the slower one write back what it
loaded, which undid a TOTP step the faster one had just claimed (the RFC 6238 §5.2 replay window)
and made unrelated requests fail each other with a lost-race `412`.

So `userService.persistTwoFactorMethods` writes a **diff**, not the array:

```mermaid
flowchart LR
    L[request loads its copy] --> M[handlers change fields on entries]
    M --> P[planTwoFactorWrite<br/>per-entry set / unset,<br/>entries added, methods dropped,<br/>account-level fields]
    P --> W[one updateOne with an<br/>aggregation pipeline]
    W --> D[(users)]
    C[claimTotpStep<br/>conditional write] --> D
```

- **Per entry, by the entry's `_id`.** Only the fields the request assigned are written, so a
  request that touched `email` cannot disturb `totp`, and a neighbour spliced away changes nothing.
- **`lastUsedStep` is never set by this write.** `claimTotpStep` owns the high-water mark; the
  in-memory copy of it is only a mirror. Re-enrolling still clears it, because a new secret starts
  over.
- **Removal is named.** The loaded copy no longer holds a removed entry, so the caller says which
  method (or `'all'`) to drop. An entry two requests both started is kept once.
- **One write.** The backup codes (when set outright) and the session epoch ride in the same
  update, so a factor change and its session revocation still land together.
- **The armed flag is derived inside the write.** The copy never sends `twoFactorEnabledAt`: a
  final pipeline stage sets it (keeping its date) when any stored entry is armed, and removes it
  otherwise. Two removals, or a restart beside a confirm, can no longer leave the flag disagreeing
  with the factors.
- **The first backup-code set is minted inside the write too.** `confirm` sends a candidate set;
  it is stored only if the account holds none by then, and the response shows the codes only when
  the stored salt is the request's own. Turning 2FA off discards the set in the same stage, only
  when no entry is armed.
- **A backup code is spent by its own conditional write.** `spendBackupCode` pulls the one digest
  while it is still stored, so of two requests carrying the same code exactly one takes it, and a
  list regenerated in between (other digests) is never resurrected. The loaded copy is mirrored
  and left unmodified, so the diff above never sends the list back.
- **Not an edit.** The update runs with `timestamps: false`: it moves neither `updatedAt` nor the
  `ETag` an admin editor holds, like the other credential bookkeeping writes.

A mailed code is checked by a pure function (`checkDeliveredCode`: none, expired, match, miss) and
paid for by a conditional write, never a read-modify-write on the loaded copy:

- **Spend.** `spendDeliveredCode` unsets the code only while the SAME digest is still stored,
  unexpired and under its attempt ceiling. Of two requests carrying one code, one matches.
- **Miss.** `recordDeliveredMiss` `$inc`s the counter, then burns the code if the STORED counter
  reached the ceiling. Parallel wrong guesses are each counted; a right code arriving after the
  ceiling finds the spend filter closed.
- **Step-up code.** `reauthCode` rides the same two doors (slot `reauth`), and its arming is a
  `timestamps: false` write, so sending a code is no edit of the account and moves no `ETag`.

The per-account reservation above still bounds guessing across codes; these writes make the
per-code ceiling real.

## The endpoint surface, and what guards each one

Reading your own factors is not a privileged act. Changing them is, and every mutation sits behind
**critical** fresh auth — see [Sessions](./account-sessions.md#freshness-auth-time-and-amr).

| Route                                       | Guard                                                               |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `GET /account/2fa`                          | `isAuth` — your own status                                          |
| `POST /account/2fa/methods/:method/setup`   | critical fresh auth **+** a valid code once any factor is armed     |
| `POST /account/2fa/methods/:method/send`    | critical fresh auth, `accountCodeSendLimiter`; armed delivered only |
| `POST /account/2fa/methods/:method/confirm` | critical fresh auth                                                 |
| `DELETE /account/2fa/methods/:method`       | critical fresh auth **+** a valid code                              |
| `DELETE /account/2fa`                       | critical fresh auth **+** a valid code                              |
| `POST /account/2fa/backup-codes`            | critical fresh auth **+** a valid code                              |
| `POST /account/login/2fa/send`              | public — `credentialLimiters`, `mfaSendLimiter`                     |
| `POST /account/login/2fa`                   | public — `credentialLimiters`, `mfaChallengeLimiter`                |

The two login routes are public because they must be: the caller has no session yet, which is the
entire point of the step. What stands in for one is the challenge — see
[Security](../tools/security.md#the-challenge-is-a-claim-check-not-a-code) for why it is a
single-use `verificationtokens` row rather than a JWT.

::: warning Two route orderings are load-bearing
`/login/2fa/send` is registered **above** `/login/2fa`, and `DELETE /2fa/methods/:method` **last**
of the method routes. Express matches in registration order, so either one moved changes which
handler answers.
:::

Why a mutation needs a code on top of a fresh session, and why removing one method is held to the
same bar as removing all of them, is argued in
[Security](../tools/security.md#the-controls-and-which-attack-each-one-answers).

## Changing factors needs a factor

Once any factor is armed, **every** `setup` — replacing one, or adding a second method — carries a
`code` from an armed factor or an unused backup code, the same `verifyAnyFactor` that removing one
asks for. The **first** factor needs only the fresh password: there is nothing to prove yet, and a
backup code is the route for someone who lost their phone. Without the rule a stolen-but-fresh
session could disarm the factor it would otherwise have to pass (OWASP MFA Cheat Sheet, "Changing
MFA Factors"; NIST SP 800-63B).

Every check of an **armed** factor — those calls, and the login challenge's code step — shares one
per-account cap of **wrong** codes: ten lock the account's 2FA checks for 15 minutes, answering
`429` before any code is compared, and the owner is mailed once (`account.two-factor-locked`). The
counter is a Mongo field on the user, not a Redis budget: the write is free, it survives a cache
outage, and one count covers every place a code is typed (NIST SP 800-63B allows up to 100). The
attempt is **reserved before it is compared** — one atomic `findOneAndUpdate` — because a
check-then-increment races: parallel guesses would all read "under the cap". A right code hands the
counter back, and so does a completed password reset (the mailbox is the account's own recovery).
Enrolment `/confirm` never counts: no factor is armed there yet. Login's own guesses are also capped
per challenge (`NODE_MFA_CHALLENGE_MAX`), keyed on the challenge cookie when an OAuth login carries
it there.

An account whose only factor is **delivered** has nothing to read a code from, so
`POST /account/2fa/methods/:method/send` mails one to the signed-in caller — armed delivered methods
only, paced by the same 30 s per-code cooldown and by its own per-account hourly budget
(`NODE_MFA_ACCOUNT_SEND_MAX`).

```mermaid
sequenceDiagram
    participant U as Signed-in caller
    participant A as API
    U->>A: POST .../email/send
    A-->>U: code mailed (masked address)
    U->>A: POST .../email/setup { code }
    A->>A: verify code, then disarm and mint the new one
    A-->>U: setup payload
```

Every add or replace, removal, and "2FA turned off" also **mails the account holder** out of band
(`account.two-factor-changed`), because a change from a stolen session is otherwise silent.

## Staff need an authenticator app

A staff role (any role in either scope: manager, warehouse, support, editor, moderator, admin,
operator) **grants nothing while no authenticator app is armed**. Every staff role reads customer
personal data, so a password alone is not enough for one (NIST SP 800-53 IA-2(1), OWASP ASVS 6.3.3).
Only an app counts: a mailed code is not a second factor for a role like this (ASVS 6.3.6; NIST
SP 800-63B-4 does not take email as out-of-band).

```mermaid
flowchart LR
    S[Staff request] --> A{Authenticator<br/>app armed?}
    A -- yes --> R[Role's rules plus the customer's]
    A -- no --> C[Customer's rules only]
    C --> G{Staff door?}
    G -- yes --> E["403 SECOND_FACTOR_ENROLLMENT_REQUIRED"]
    G -- no --> O[Served as a customer]
```

- **Read fresh on every request** (`authenticatorEnabledAt` on the user, derived with
  `twoFactorEnabledAt` in the same write). A role granted to an account with no app is withheld on
  its very next request; enrolling unlocks it on the next one. No session is revoked either way.
- **The account keeps its customer powers and can enrol**, so nobody is locked out of the app that
  unlocks the role. `403 SECOND_FACTOR_ENROLLMENT_REQUIRED` is said only to a session that WOULD
  hold the rule once enrolled; anyone else gets the plain refusal.
- **`GET /account/abilities` carries `secondFactorRequired`**, so a client shows an "enrol to use
  your staff tools" prompt instead of a staff menu the server will refuse.
- **Taking the app away revokes the keys the staff member minted** (`account.authenticator-removed`,
  announced from the same removal; `api-keys` revokes). A key also never holds more than its minter
  does now: a minter with no app lends it no staff rule. API keys themselves still carry no second
  factor, by design.
- **The system actor is no person** and is never gated.

## Adding a channel

1. Write the handler under `methods/` — one file, satisfying `TwoFactorMethodHandler`.
2. Add it to `HANDLERS` in `registry.ts`, in the position a client should offer it.
3. Gate `available()` on whatever the channel needs, the way `email` gates on SMTP.

No service, controller, contract or schema change. That is the property the registry exists to buy,
and the reason `sms` is described everywhere as "a third handler and no other change".

## Libraries

`otplib` is `account`'s alone — see [Package Dependencies](../tools/package-dependencies.md) for
where it sits among everything else this repo depends on.

| Library                             | Maintained             | What it costs you                                                |
| ----------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `otplib` (chosen)                   | active, typed          | RFC 4226/6238 TOTP + HOTP, a QR-ready `keyuri`, nothing else     |
| `speakeasy`                         | unmaintained for years | the same RFCs, but a security-relevant dependency nobody patches |
| hand-rolled HMAC-SHA1 time-stepping | —                      | exactly the kind of crypto `CLAUDE.md` rules out writing by hand |

## Related pages

- [`account`](./account.md) — the module this belongs to
- [Sessions](./account-sessions.md) — the tokens a completed 2FA login mints, and `amr`
- [Security](../tools/security.md#two-factor-authentication) — the crypto, the controls, the gaps
- [`users`](./users.md) — where the factors are stored
- [OAuth](./account-oauth.md) — the other way in, and it consults 2FA like the password login
