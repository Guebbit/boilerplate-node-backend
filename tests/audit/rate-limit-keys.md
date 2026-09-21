---
description: Audit whether every rate-limit budget buckets callers by something an attacker cannot cheaply rotate
argument-hint: <module|path|--diff>  (default: every module that declares a budget)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(ls:*), Bash(2brain query:*)
---

ROLE: Rate-limit auditor. You do not ask whether a budget is enforced — other
tests answer that. You ask what a budget BUCKETS BY, and what it costs an attacker
to get a fresh bucket.

GOAL: Find budgets whose key an attacker controls, rotates cheaply, or shares with
innocent callers.

**Every budget this audit looks at works.** It refuses at its limit and its tests
pass. A budget keyed on the wrong thing is not broken — it is bypassed, which looks
identical from inside the process.

SCOPE: $1 — a module name (`account`), a path, or `--diff` for modules touched by
the working tree. If empty, audit every `rate-limits.ts` in the repo plus
`src/infrastructure/http/middlewares/rate-limit.ts`.

## Why this is a prompt and not a test

The pentest check this replaces — "distributed-IP bypass" — needs thousands of real
distinct source addresses. One host cannot fake them, so no Jest test can run it and
no model can either. That half stays manual, or stays undone.

What IS checkable is the property the attack exploits: whether a budget's key is
something the attacker supplies. That is a judgement about each new limiter, which
is why it lives here.

## Naming the scope

Output is `reports/audit/rate-limit-keys/<SCOPE>.md`, where `<SCOPE>` is:

- a module → the module name (`account`)
- a path → the path slugged, `src/` dropped
- `--diff` → the current branch name slugged (`git branch --show-current`)

## Background the audit assumes

Read these first; the findings below are all departures from them.

- `buildRateLimiter` is the ONE factory every budget is built from. A limiter
  constructed any other way is a finding on its own.
- A budget with no `keyGenerator` falls back to `express-rate-limit`'s default: the
  caller's single address. That is the weakest key available — a residential-proxy
  pool is about $20 for millions of addresses, and one IPv6 customer is allocated
  18 quintillion.
- `addressBlockOf` widens that to an IPv4 /24 or an IPv6 /64, which is the cheapest
  real defence and the intended default for anything anonymous.
- `identityOf` hashes the request BODY's `email`/`username`. That key is
  attacker-supplied by construction: it bounds one victim account being guessed at,
  and bounds nothing at all about one attacker sweeping many accounts.
- `keyedBy` is a hand-written label that feeds the generated table in
  `docs/tools/security.md#the-rate-limit-budgets`. It is prose, not behaviour.

## Steps

### 1 — enumerate every budget in scope

Every `RateLimitBudget` literal. For each, record `namespace`, `keyGenerator` (or
its absence), `keyedBy`, `skipSuccessfulRequests`, and where it is mounted.

A budget declared and never mounted is a finding. Say which route was expected to
carry it.

### 2 — answer one question per budget

**What does an attacker pay for a fresh bucket?**

| key               | attacker pays                                           |
| ----------------- | ------------------------------------------------------- |
| `identityOf`      | nothing — change one body field                         |
| default (address) | a proxy hop, cents, or free on IPv6                     |
| `addressBlockOf`  | a new /24 or /64 — the cheapest key that costs anything |
| `credentialId`    | a new credential, which you must be issued              |
| `accountId`       | a new account, through signup, which is itself budgeted |

Anything in the top two rows is only acceptable when something else covers the
same route. Which brings the actual finding:

### 3 — the four tells

- **An identity-keyed budget with no address-block partner on the same route.**
  `identityOf` bounds guessing at ONE account. Credential stuffing does the
  opposite — one guess each against a million accounts — and never touches the same
  bucket twice. The account module pairs them for this reason (`signupLimiters`).
  An identity-keyed budget standing alone is the headline finding of this audit.
- **A `keyGenerator` reading a header.** `X-Forwarded-For`, `X-Real-IP`, an api-key
  header, a tenant header: all attacker-supplied unless a trust-proxy hop count
  vouches for them. `request.ip` is only trustworthy because `trust proxy` is set
  to a specific hop count; a hand-read header has no such guarantee.
- **A budget keyed on something SHARED by innocent callers.** The mirror image, and
  it fails the other way: keying a partner api on the address buckets every partner
  behind one CDN together, so one noisy integration refuses everyone else. That is
  why `apiKeyLimiter` keys on `credentialId`.
- **`keyedBy` disagreeing with `keyGenerator`.** The label is published in
  `docs/tools/security.md` and nothing checks it. A budget that says "per account"
  and keys on the address is a documented defence that does not exist.

### 4 — classify

`sound` / `weak key, covered by a partner` / `WEAK KEY, UNCOVERED` / `label drift`.

For a `WEAK KEY, UNCOVERED`, give the concrete bypass in one line: what the
attacker changes between requests, and what it costs.

## Output

Write `reports/audit/rate-limit-keys/<SCOPE>.md`:

| budget | namespace | key (file:line) | mounted on | partner budget | verdict | bypass |

Then print the `WEAK KEY, UNCOVERED` and `label drift` rows, cheapest bypass first.

Rules:

- Do NOT write or modify tests or source. This is a report.
- `sound` rows stay in the table. A report that lists only accusations reads as a
  list of bugs; the table is what makes "23 of 25 are fine" legible.
- A weak key is NOT a finding when the route carries a partner budget that covers
  the same traffic. Name the partner and move on.
- A deliberate weak key is recorded as deliberate, with the comment that says so.
  The global browsing brake is address-keyed on purpose — it is a brake, not a
  gate, and it exists to slow a scanner rather than stop an attacker.
- `reports/` is gitignored. These files are working evidence, not deliverables.
