# Email verification — enforcement, and a change that waits to be proven

Split out of `SECURITY_ATTACK_COVERAGE_PLAN.md`, which found the gap but is the wrong place to
design the fix. Two separate problems share one mechanism, which is why they are one plan.

## What exists today, accurately

The verification mechanism is complete and correct. Nothing below replaces it.

- `EMAIL_VERIFY_TOKEN_TYPE = 'verify'`, 24-hour TTL, issued by `tokenAdd`, stored as a sha256
  digest alongside the reset and delete-confirmation tokens, spent atomically through
  `findLiveToken`/`spendLiveToken`.
- `sendVerificationEmail` is the single issuer, deliberately: three flows start a verification
  (signup, an email change, the explicit re-send) and it exists so they cannot drift.
- `POST /account/verify-request` re-sends (behind `credentialLimiters` + `isAuth`, and honest
  about an already-verified account rather than soothing). `POST /account/verify-confirm` spends
  the token and sets `verified = true`.
- An email change on `PUT /account` already requires a FRESH session
  (`requireFreshAuthWhen(isChangingEmail, REAUTH_TIME_SENSITIVE)`), so a stolen access token on
  its own does not get to change the address.

## Problem 1 — the flag is written and never read

`verified` is set correctly and consulted by nothing. No route, guard or middleware reads it.
Grep confirms it: the field appears in `users/model.ts`, in the serializer, and in the two
verification services. That is the whole list.

So an account bound to an address its holder does not own can order, check out and pay. The
catalog rows this leaves open are §17 _Unverified email at signup_ and §3 _Pre-account-takeover_ —
and note that OAuth linking already refuses an unverified match, but it demands verification of
the PROVIDER, not of this account. A password signup is asked for nothing.

## Problem 2 — an email change binds the new address before it is proven

Today, `PUT /account` with a new address does three things at once:

1. writes the new address onto `user.email` immediately,
2. sets `verified = false`,
3. sends a verification link to the NEW address.

The old address is never told anything. That has two consequences, and the second is the security
one:

- **A typo locks the account out.** The account now belongs to an address nobody reads. Password
  reset goes there. There is no path back that does not involve an operator.
- **A momentary session compromise becomes permanent.** Fresh-auth means the attacker had to have
  the password, but once they change the address the real owner gets no notice at all — no mail to
  the old address, no audit trail the user can see. Reset now goes to the attacker.

The control both of these want is the same one every mature product ships: **the change is
pending until the new address proves itself, and the old address is told it was asked for.**

## What to build

### A. `pendingEmail` — the change waits

`PUT /account` stops writing `email` and writes `pendingEmail` instead. The account keeps its
current, proven address until the new one is confirmed; confirming swaps it in.

- New field on the user model, `select: false` like the other credential-adjacent fields.
- A migration under `src/modules/users/migrations/<timestamp>-pending-email.js` — the module owns
  its own migrations now, and `gen:migrations` assembles `db/migrations/`.
- Collisions have to be answered twice: at request time (someone else already owns that address →
  409, the same E11000 mapping signup uses) and again at swap time, because the two are separated
  by up to 24 hours and the unique index is the only real authority.
- Cancelling: a second `PUT /account` sending the CURRENT address clears `pendingEmail`. Cheaper
  than an endpoint, and it is what a user retyping their real address would naturally do.

### B. A second token type, not a reuse of `'verify'`

`'verify'` today means _prove the address this account already has_. The swap means _prove the
address this account has asked for_. Spending one must not do the other's work — a signup-verify
token that swapped a `pendingEmail` would be a bug with an account takeover on the end of it.

Add `EMAIL_CHANGE_TOKEN_TYPE = 'email-change'` alongside it, same TTL, same hashed-at-rest
storage, same `findLiveToken`/`spendLiveToken` path. `sendVerificationEmail` stays the single
issuer and takes which of the two it is issuing.

### C. Tell the OLD address

The notification the current flow is missing. Sent to the address being replaced, the moment the
change is REQUESTED, not when it completes — a notice that arrives after the takeover is a
receipt, not a warning.

- New template `account.email-change-notice.ejs`, new copy in `en.json` and `it.json` (the
  `locale-parity` and `mail-copy` cross-cutting tests enforce both).
- Enqueued the way every other account mail is: in the recipient's own locale, resolved before
  the job is published, `'high'` priority — the user is being asked to react.
- It carries no token and no link that acts. "This was not me" is a password change and a
  logout-everywhere, both of which already exist; the mail points at them rather than adding a
  fourth one-click path into the account.

### D. Confirming the swap

`completeEmailVerification`'s sibling: spend the `email-change` token, move `pendingEmail` into
`email`, set `verified = true`, clear `pendingEmail`, audit it.

**Open question worth answering explicitly: does the swap revoke every refresh token?** A password
change does. An email change is the stronger takeover primitive of the two, which argues yes — but
it logs out the user's other devices in response to an action they took deliberately, which is
friction on a legitimate flow. Recommendation: yes, revoke. The row this closes (§3 _Missing
invalidation_) is worth more than the friction, and it matches what the account already does for
deactivation and password change.

### E. `requireVerified`, and the decision about where it mounts

A guard next to `requireFreshAuth` in `kernel/middlewares/authorizations.ts`, answering 403 with a
distinguishable code so the frontend can route to "check your inbox" rather than a generic denial.

**This is the decision to make before any code is written.** The guard is twenty lines; where it
mounts is a product choice with no default that is right for everyone:

| Option                    | What it costs                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Checkout and payment only | Minimal friction; a browsing, cart-filling, wishlist-keeping unverified account stays fully usable   |
| Every authenticated write | Consistent and easy to explain; blocks an unverified user from doing anything at all past logging in |
| Nothing (today)           | A boilerplate that ships a verification flow and enforces it nowhere teaches the wrong default       |

Recommendation: **checkout and payment**, mounted the way `requireFreshAuth` already is — the two
routes where the app's money moves, which are also the two that already demand a fresh session.
It closes the row that matters, leaves the demo profile usable, and the mount list is one line to
extend later.

The demo profile needs a decision too: seeded accounts must be created verified, or the demo
breaks at checkout.

## Contract work

This adds a field and an endpoint, so the contract discipline applies in full and in order:

1. Edit `src/modules/account/openapi.yaml` (the confirm endpoint) and
   `src/modules/users/openapi.yaml` (`pendingEmail` on the user, `readOnly`) — never the root
   bundle.
2. `npm run contracts:bundle`.
3. `npm run gen:api` — the Zod schema for the new body, and the types the controller reads.
4. `npm run gen:asyncapi` if the notice mail gets its own outbox name.
5. `npm run sync:frontend` against `../boilerplate-vue-frontend`.

`npm run regenerate` does all of it in the only order that works.

## Test surface

- **Unit** — the swap: pending set, token spent, `email` moved, `verified` true, `pendingEmail`
  cleared; a `'verify'` token refused by the swap and an `'email-change'` token refused by the
  plain confirm.
- **Integration** — the takeover shape end to end: change the address, assert the account still
  authenticates under the OLD one until the token is spent, and that the old address received the
  notice.
- **Cross-cutting** — `locale-parity` and `mail-copy` pick up the new copy automatically;
  `write-routes-are-guarded` will need `requireVerified` taught to `guardsOn`.

## Sequencing

1. **The mount decision** (E) — everything else is mechanical once it is made.
2. **B, then A** — the token type before the field that depends on it.
3. **D**, including the revoke answer.
4. **C** — the notice mail; last because it is copy and locales, not logic.
5. **E's guard and mounts**, plus the demo-profile fix.

## Rows this closes

| §   | Row                                  | After this plan                                                             |
| --- | ------------------------------------ | --------------------------------------------------------------------------- |
| 17  | Unverified email at signup           | closed at the routes that matter; named explicitly where it is not enforced |
| 3   | Pre-account-takeover                 | closed — an address cannot back an account until it is proven               |
| 3   | Email-change without re-verification | fully closed; today only the fresh-session half is                          |
| 3   | Missing invalidation                 | closed for the email-change path, if D revokes                              |
