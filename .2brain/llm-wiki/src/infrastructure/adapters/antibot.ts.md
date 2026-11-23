---
source: src/infrastructure/adapters/antibot.ts
source_sha256: c00030ff1b87233f4d384a5e7fb0146d9ca48ddb8b7fbde59005bc679a209325
context_sha256: ec701f9f308cca52edca18d03dad3fd733070450cbcb26c32c4a5dc36941ecbf
generated_at: 2026-11-22T02:34:57.501995+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/antibot.ts

## Purpose
Rung 2 of the anti-automation ladder: decides whether an email address may proceed, by refusing disposable-inbox domains or (optionally) domains with no mail target. It is off by default (`NODE_ANTIBOT_EMAIL_POLICY`) because blocklists need maintenance and aggressive ones refuse real users on legitimate forwarding services. It only answers yes/no; each caller decides what a `refused` verdict means for its endpoint.

## Key elements
- `EmailPolicy`: type `'off' | 'disposable' | 'mx'`, the three deployment postures.
- `resolveEmailPolicy()`: reads `NODE_ANTIBOT_EMAIL_POLICY` via `antibotConfig()` fresh on every call. It is exported so `GET /config` can publish it. It throws on a value outside the closed set, so a typo cannot silently become `off`.
- `checkEmailPolicy(email)`: the main export. Returns `Promise<RungVerdict>` (`ok` or `refused`). Flow:
  1. Policy `off` returns `ok`.
  2. A domain in `NODE_ANTIBOT_EMAIL_ALLOWLIST` returns `ok`.
  3. A domain in `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA`, or one that `isDisposableEmailDomain` flags (from `disposable-email-domains-js`), returns `refused`.
  4. Policy `disposable` returns `ok`.
  5. Policy `mx` returns the result of the MX check.
- `mxResolver` (private): a `node:dns/promises` `Resolver` with a 2000 ms timeout and 1 try, so a slow nameserver cannot stall a signup request.
- `hasMxRecord` (private): resolves `false` only on evidence of "no mail". That means NXDOMAIN, a null MX (RFC 7505), or no MX and no A/AAAA. If MX returns ENODATA or an empty list, it falls back to `hasAddressRecord`.
- `hasAddressRecord` / `addressesOf` / `isNoDataError` (private): implement the RFC 5321 A/AAAA fallback. `ENOTFOUND` and `ENODATA` count as "no data".

## Relationships
- `src/infrastructure/adapters/antibot-verdict.ts`: supplies the `RungVerdict` type returned by `checkEmailPolicy`.
- `src/infrastructure/adapters/config.ts`: `antibotConfig()` supplies the policy, allowlist and extra denylist.
- `src/infrastructure/adapters/logger.ts`: its `logger` records a warning when a DNS lookup fails.
- `src/modules/account/services/signup.ts` and `src/modules/tasks/services/contact.ts`: callers that act on the verdict. The file's comments name `signup` as a `.then`-chained caller.
- `src/modules/antibot/service.ts`: its relationship is not visible in this file. The `GET /config` comment suggests `resolveEmailPolicy` is exposed alongside rung 3's provider.
- `tests/unit/infrastructure/adapters/antibot.test.ts`: unit tests for this module.

## Notes
- DNS failures (timeout, SERVFAIL, refused) are treated as unknown, not refusal. They fail open: the check resolves `true`, which gives `ok`, and logs a warning.
- `checkEmailPolicy` wraps its body in `Promise.resolve().then(...)`. An invalid policy value therefore surfaces as a rejected promise rather than a synchronous throw, which `.then`-chained callers would miss.
- The domain is taken after the last `@` and lower-cased. Allowlist and denylist matching uses `.includes` on that lower-cased domain.
- The allowlist is checked before the denylist and disposable list, so it overrides both.
- Under the `mx` policy, the disposable and denylist checks still run before DNS.
