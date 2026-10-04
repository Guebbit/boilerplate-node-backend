# OAuth

Signing in with somebody else's identity provider — the port, the CSRF handshake across the
redirect, and the three outcomes a callback can have.
[Web attack defences](../theory/defences/authentication.md#federated-login)
carries the same three defences as attack rows — the `state` cookie, the server-derived URIs, and the
linking rule — naming what each one stops. This page is the mechanism behind them.

::: tip At a glance
**The shape** — `config.ts` reads the env, `state.ts` owns the CSRF cookie, `providers/` holds the
port and one file per implementation.
**Published** — nothing. Minting this application's sessions is [`account`](./account.md)'s own
business, exactly as [Sessions](./account-sessions.md) is.
**Breaks if you change** — `oauthRedirectUri`. Every provider's console has the old value
registered, and a mismatch fails the exchange, not the redirect.
:::

## The port, and why several may be live at once

Same seam as [`payments`](./payments-provider-port.md)' provider port, with one deliberate
difference: a deployment can offer Google **and** GitHub together, so there is no single
`NODE_*_PROVIDER` switch to pick a winner.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 32, 'rankSpacing': 44}}}%%
flowchart LR
    R["GET /account/oauth/:provider"] --> RG["providers/index.ts<br/><i>registry</i>"]
    RG --> G["google.ts"]
    RG --> H["github.ts"]
    RG --> F["fake<br/><i>a double: dev preload only</i>"]
    G --> P["OAuthProvider<br/><i>authorizeUrl · exchangeCode</i>"]
    H --> P
    F --> P
    P --> ID["OAuthIdentity<br/><i>providerId · email · emailVerified</i>"]

    classDef port fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef impl fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef out fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class P,RG port;
    class G,H,F impl;
    class ID,R out;
```

Each registry entry is a **closure re-checked on every call**, never a value computed at import: a
provider is configured when its `NODE_OAUTH_<NAME>_CLIENT_ID` / `_CLIENT_SECRET` pair is set in
the environment the process was started with (or a test override), and the registry holds no copy
of its own to go stale. An unconfigured provider resolves `undefined`
and the route answers 404 — the same "loud, never silently wrong" stance an unset
`NODE_PAYMENT_PROVIDER` gets.

`fake` is the dev preload's stand-in (a [test double](../tools/test-doubles.md), not in `src/`): no network call and no consent screen, so a Cypress spec
clicking "Continue with Google" never leaves this app. It still round-trips the real `state` cookie,
so the CSRF check gets genuine coverage rather than being skipped in the suite that exercises it
most.

## Two URLs, both server-derived

| Value                                  | Built from          | Never from            |
| -------------------------------------- | ------------------- | --------------------- |
| the redirect URI given to the provider | `NODE_URL`          | the request           |
| where the callback sends the browser   | `NODE_FRONTEND_URL` | the provider's answer |

That is the whole of the open-redirect and callback-confusion defence, and it works only because
`config.ts` is the single place both the start and the callback controller read them from.

## The CSRF handshake

A double-submit cookie, not server-side state: the value is minted and handed to the provider as
`state` in the **same response** that sets it as `oauth_state`, and the callback trusts a request
only when the two agree. No new server secret, unlike a signed token would need.

- 128 bits, from `randomBytes(16)` — the same entropy every `tokens[]` value carries.
- 5 minutes: long enough to pick a Google account, short enough to bound reuse.
- `httpOnly` / `sameSite: 'lax'`, `secure` in production — `createRefreshCookie`'s flags exactly.
- Cleared by **both** a successful and a failed callback.

## What else rides the round trip: `continue` and `locale`

The start route accepts two optional query params. Each is saved as a cookie beside `oauth_state`
(same 5 minutes, same flags, same clearing points) and echoed on the redirect back to the frontend.

| Param      | Cookie           | Validated by       | Echoed on                            |
| ---------- | ---------------- | ------------------ | ------------------------------------ |
| `continue` | `oauth_continue` | `isSameOriginPath` | the success and the 2FA redirect     |
| `locale`   | `oauth_locale`   | `isLocaleTag`      | every redirect, a failure's included |

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 32, 'rankSpacing': 44}}}%%
flowchart LR
    A["/it/login<br/><i>the visitor's page</i>"] -->|"?locale=it"| B["GET /account/oauth/:provider<br/><i>validates, saves cookie</i>"]
    B --> C["provider consent"]
    C --> D["GET .../callback<br/><i>re-validates the cookie</i>"]
    D -->|"?locale=it"| E["/oauth/callback<br/><i>redirects to /it/...</i>"]
```

Both are **validated twice**: at the start against the query, and again at the callback against
the cookie, because a cookie is client-writable. An invalid value is dropped silently, since a
browser navigation has nowhere to show a JSON error. `locale` exists because `NODE_FRONTEND_URL`
names an origin, not a page: with no `continue` target and no saved language preference, the
frontend has nothing else to tell an `/it/login` visitor from an `/en/login` one. A saved
preference on the account still wins, exactly as it does for a password login.

## Three outcomes, and the one that is a security decision

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 32, 'rankSpacing': 46}}}%%
flowchart TD
    E["exchangeCode → OAuthIdentity"] --> Q1{"(provider, providerId)<br/>already on file?"}
    Q1 -->|"yes"| L["log in<br/><i>case 1</i>"]
    Q1 -->|"no"| Q2{"an account with<br/>this email?"}
    Q2 -->|"no"| S["sign up, password-less<br/><i>case 3</i>"]
    Q2 -->|"yes"| Q3{"provider vouches<br/>for the address?"}
    Q3 -->|"yes"| K["link the identity<br/><i>case 2</i>"]
    Q3 -->|"no"| X["refuse —<br/>?error=email_unverified"]

    classDef ok fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef bad fill:#fee2e2,stroke:#dc2626,color:#111827;
    class L,S,K ok;
    class X bad;
```

::: warning `providerId` is the identity key, never `email`
An email match is consulted **only** when no identity is on file, and it only ever **links** — it
never logs anyone in on its own. A provider's email can change while its subject id cannot, and
anyone able to register an OAuth app under a victim's address must not be able to walk into that
account. `emailVerified` is the provider's own claim, and an unverified match is refused rather
than linked.
:::

Two identities minting the **same** never-before-seen account at once is the race the
`users_oauth_identity` unique index exists for: the loser's `create` rejects with `E11000`, the
callback turns that into a generic `?error=provider_error`, and the caller's retry finds case 1.

## The endpoint surface, and how failure travels

| Route                                   | Answers                                                     |
| --------------------------------------- | ----------------------------------------------------------- |
| `GET /account/oauth/providers`          | the configured names — a deployment with no keys lists none |
| `GET /account/oauth/:provider`          | 302 to the consent screen, `state` cookie set               |
| `GET /account/oauth/:provider/callback` | 302 back to the frontend, session cookies set               |

All three are public, because this **is** how an unauthenticated caller signs in, and all three sit
behind `credentialLimiters`.

Only two failures answer with a body. Everything past the state check redirects to the frontend
with `?error=<code>`, because by then the browser is mid-navigation and a JSON body has nowhere to
be read:

| Failure                                  | Answer                        |
| ---------------------------------------- | ----------------------------- |
| provider never configured                | `404`                         |
| `state` missing or mismatched            | `400`                         |
| consent declined                         | `302 ?error=access_denied`    |
| no `code`, or the exchange failed        | `302 ?error=provider_error`   |
| email match the provider won't vouch for | `302 ?error=email_unverified` |

The success path calls the same `issueSession` [`postLogin`](./account-sessions.md) does, with
`amr: [provider.name]` — so a Google login records **how** it was proved, and the freshness guards
read it like any other method. It returns no access token: the frontend's
`GET /account/refresh` bootstrap mints one the moment it lands.

## Two consequences worth naming

- **An OAuth-only account has no password.** `users.password` is deliberately not `required`, and
  sign-in for such an account works only through a provider — until a password reset gives it one.
  Its step-up is a code mailed to its verified address, so enabling a provider needs mail that
  delivers: boot refuses the pair otherwise outside development and test
  ([how](./account-sessions.md#step-up-for-an-account-with-no-password)).
- **The callback applies the account's second factor.** An account with `twoFactorEnabledAt` set gets
  the same login challenge `POST /account/login` would issue, not a session: the callback redirects
  the browser to the frontend's 2FA step and the session is minted only after
  [`POST /account/login/2fa`](./account-two-factor.md). A provider is one way to prove the first
  factor, never a replacement for the second (the attack row:
  [Federated login](../theory/defences/authentication.md#federated-login)).

## Related pages

- [`account`](./account.md) — the module this belongs to
- [Sessions](./account-sessions.md) — the session a callback mints, and `amr`
- [Two-factor authentication](./account-two-factor.md) — the second factor this path also owes
- [`users`](./users.md) — `oauthAccounts` and the unique index behind it
- [Web attack defences](../theory/defences/authentication.md#federated-login) — the same subsystem as attack rows
- [`payments` provider port](./payments-provider-port.md) — the port this one is shaped after
