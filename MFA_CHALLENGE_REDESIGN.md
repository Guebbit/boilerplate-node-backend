# MFA login challenge: drop the JWT, reuse the existing single-use-token mechanism

**Status: implemented.** Written from the BE (PHP) side while porting 2FA, where the equivalent
shape landed differently — not because PHP has no JWT library, but because building it this way
turned out to close a real gap. This file exists so BEold can adopt the same shape deliberately,
rather than the two backends drifting apart on how a login challenge works.

Landed as described below, with three corrections found during implementation:
`verifyLoginChallenge`/`sendLoginCode` route through `findLiveToken` (`account/services/tokens.ts`)
rather than a raw `findByToken` call, since only `findLiveToken` checks `expiration` — a raw
`findByToken` would have let an expired challenge keep authenticating until the next sweep;
`sendLoginCode` needed the same swap as `verifyLoginChallenge`, not just the one call site; and the
two challenge TTL tiers (`MFA_CHALLENGE_TTL_SECONDS`/`_DELIVERED_TTL_SECONDS`) moved to
`account/services/two-factor.ts` as millisecond constants, since `session/jwt.ts` no longer has any
MFA-specific code left to own them.

## What BEold does today

`POST /account/login`, once the password checks out and `twoFactorEnabledAt` is set, calls
`createMfaChallenge(id)` (`session/jwt.ts`): a JWT signed with the **access token secret**,
carrying `{ id, purpose: 'mfa' }`, expiring in `MFA_CHALLENGE_TTL_SECONDS` (300). `POST
/account/login/2fa` verifies it with `verifyMfaChallenge()` — an ordinary access-token verify plus
a check that `purpose === 'mfa'`.

## Two things worth fixing, found while building the PHP twin

1. **It reuses the access-token secret for a different purpose**, and the only thing stopping a
   challenge token from being accepted as a real access token is that `account/module.ts`'s
   `resolve()` rejects any token carrying `purpose` — one `if` in one file, everything else about
   the shape relies on it. The code's own comment already names this as "the classic way a step-up
   challenge like this gets built wrong." It works, but it is one missed check away from not
   working.
2. **It is not revocable.** A JWT verifies itself; there is no row to delete. A second
   `POST /account/login` on the same account issues a second, independent challenge, and the first
   one stays valid for the rest of its five minutes — nothing here is exploitable without ALSO
   knowing the password, but it is a live credential outliving the moment it stopped being the
   caller's most recent attempt, for no reason.

Neither is hypothetical severity, both are just unnecessary: this codebase already has a
single-use, revocable, hashed-at-rest token mechanism, and the MFA challenge is the one place that
doesn't use it.

## The existing mechanism this can reuse instead

`users/model.ts`'s `tokens[]` + `TokenType` + `tokenAdd`/`consumeToken`, already serving
`password-reset`, the admin-setup link, and account-deletion confirmation:

- `tokenAdd(user, type, ttlMs)` mints a random value, stores its sha256 digest in
  `user.tokens[]`, returns the plaintext.
- `userRepository.findByToken(token, type)` — **already a global lookup**, not scoped to a known
  user: it hashes the plaintext and finds whichever user document holds a matching
  `{ tokens: { $elemMatch: { token, type } } }`. This is exactly "resolve who a challenge names,"
  and it does **not** consume it.
- `consumeToken(user, token)` spends it (`$pull`), idempotently — a second simultaneous spend is a
  no-op rather than a race.

`findByToken` doing the lookup without spending is the whole design this needs, and it's not new
code — `POST /account/reset-confirm` already depends on the same peek-then-spend shape implicitly
(it reads the user by token, sets the new password, and only then removes the token).

## The change

1. Add `TokenType.MFA_CHALLENGE = 'mfa-challenge'` next to `REFRESH`/`PASSWORD_RESET`.
2. `postLogin` (`controllers/post-login.ts`): replace
   `{ mfaRequired: true, challenge: createMfaChallenge(userId) }` with
   `tokenAdd(user, TokenType.MFA_CHALLENGE, MFA_CHALLENGE_TTL_MS)`, returning the plaintext as
   `challenge`. Needs the full `user` document (already loaded by `accountService.login`), not just
   the id.
3. `postLoginTwoFactor` / `verifyLoginChallenge` (`services/two-factor.ts`): replace
   `verifyMfaChallenge(challenge)` with `userRepository.findByToken(challenge,
TokenType.MFA_CHALLENGE)`. `null`, or a user with no `twoFactorEnabledAt`, both answer 401 exactly
   as today — same reasoning, same wording, nothing about the failure shape changes.
4. On a **right** code: `consumeToken(user, challenge)` before minting the session. On a **wrong**
   code: do nothing to the token — it is still live, and `mfaChallengeLimiter` is what bounds how
   many times it can be tried, exactly as today.
5. Delete `createMfaChallenge`, `verifyMfaChallenge`, `MFA_CHALLENGE_TTL_SECONDS`, and the
   `purpose` claim from `TokenData` — nothing else in the codebase reads `purpose`, so this removes
   a special case from the one function (`resolve()`) that every access token flows through, rather
   than adding one.

`mfaChallengeLimiter`'s key generator (`sha256` of the challenge string) is unchanged — it already
treats the challenge as an opaque string, and it stays one.

## One property this either gains or doesn't, decide separately

BEold's `tokenAdd` never clears an earlier token of the same type before pushing a new one — a
second `POST /account/reset-request` leaves two live reset tokens, and a second login attempt
would, under this proposal, leave two live challenges the same way. That is BEold's existing
behaviour for every token type today, not something this change introduces, so **whether to also
make `tokenAdd` drop earlier same-type tokens is a separate decision**, wider than MFA, and out of
scope for this file. The PHP twin's equivalent (`AccountToken`) does drop them, which is a real
difference between the two right now regardless of what happens here — worth its own line in
whichever document tracks BE/BEold divergences once this lands.

## Why this belongs in a file rather than just being done

`HANDOFF.md`'s governing rule for the PHP port is "no task may require a BEold edit" — this backend
is BEold, and the port session that found this working PHP-side has no business editing it.
Written down here so whoever next has BEold open can pick it up as a decision already made, not a
question.
