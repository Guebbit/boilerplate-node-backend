---
name: rate-limit-keys
description: Audit whether every rate-limit budget buckets callers by something an attacker cannot cheaply rotate
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Rate-limit auditor. You do not ask whether a budget is enforced — other
tests answer that. You ask what a budget BUCKETS BY, and what it costs an attacker
to get a fresh bucket.

GOAL: Find budgets whose key an attacker controls, rotates cheaply, or shares with
innocent callers.

**Every budget this audit looks at works.** It refuses at its limit and its tests
pass. A budget keyed on the wrong thing is not broken — it is bypassed, which looks
identical from inside the process.

SCOPE: the argument you were given: a module name (`account`), a path, `--diff` or `whole-repo` (`scripts/audit/RULES.md` rule 5).
Empty means `whole-repo`: every `rate-limits.ts` in the repo plus
`src/infrastructure/http/middlewares/rate-limit.ts`. A diff that touches
`src/infrastructure/http/middlewares/rate-limit.ts` or `src/types/rate-limit-budget.ts` widens the
scope to every budget (the shared key functions live outside every module); say so in the report.

## Why this is a prompt and not a test

The pentest check this replaces — "distributed-IP bypass" — needs thousands of real
distinct source addresses. One host cannot fake them, so no Jest test can run it and
no model can either. That half stays manual, or stays undone.

What IS checkable is the property the attack exploits: whether a budget's key is
something the attacker supplies. That is a judgement about each new limiter, which
is why it lives here.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/rate-limit-keys/<SCOPE>…`. `<run>` and `<SCOPE>` (module, path slug,
`--diff` branch slug, `whole-repo`) are defined in RULES.md rule 4.

## Background the audit assumes

Read these first; the findings below are all departures from them.

- `buildRateLimiter` is the factory every budget is built from. A limiter constructed any other way
  is a finding on its own. The one sanctioned second door is `chargeBudget`
  (`src/infrastructure/http/middlewares/rate-limit.ts`), for a service that picks the recipient
  itself (the mail budget).
- A budget with no `keyGenerator` falls back to `express-rate-limit`'s default: the
  caller's single address (the library masks IPv6 to a /56). That is the weakest key available — a residential-proxy
  pool is about $20 for millions of addresses, and one IPv6 customer is allocated
  18 quintillion.
- `addressBlockOf` widens that to an IPv4 /24 or an IPv6 /48, which is the cheapest
  real defence and the intended default for anything anonymous.
- `identityOf` hashes the request BODY's `email`/`username`. That key is
  attacker-supplied by construction: it bounds one victim account being guessed at,
  and bounds nothing at all about one attacker sweeping many accounts.
- `keyedBy` feeds the generated table in `docs/tools/security.md#the-rate-limit-budgets`; `bounds`
  (`module.yaml`) feeds only `rate-limits.generated.ts`. Both are prose, not behaviour, and so is
  every comment and doc that names a key. Nothing but this audit compares them with `keyGenerator`.

## Steps

### 1 — enumerate every budget in scope

Every `RateLimitBudget` literal. For each, record `namespace`, `keyGenerator` (or
its absence), `keyedBy`, `skipSuccessfulRequests`, `skip`, `requestWasSuccessful`, `escalation`,
`audited`, and where it is mounted. `skip` and `requestWasSuccessful` also decide who is counted;
`audited` is there because a budget's audit write changes what one request costs us.

A budget declared and never mounted is a finding. Say which route was expected to
carry it.

### 2 — answer one question per budget

Two questions per budget.

**What does an attacker pay for a fresh bucket?**

| key                     | attacker pays                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identityOf`            | nothing — change one body field                                                                                                                                                       |
| default (address)       | a proxy hop, cents, or free on IPv6                                                                                                                                                   |
| `addressBlockOf`        | a new /24 or /48 — the cheapest key that costs anything                                                                                                                               |
| `credentialId`          | a new credential, which you must be issued                                                                                                                                            |
| `accountId`             | a new account, through signup, which is itself budgeted                                                                                                                               |
| uploader                | a key, else an account, else the address block: it falls back in that order, and the last rung is the block                                                                           |
| challenge               | attacker-supplied, but a new value moves the guesses off the live challenge, so it buys nothing                                                                                       |
| canonical mailbox       | attacker-named on purpose: it bounds the victim's inbox, not the attacker                                                                                                             |
| account across sessions | a new account. Every session of one account shares the bucket: a stolen session's failures also refuse the owner's other sessions for the window, and signing in again is the way out |

**What does one request cost us?** What it writes or spends: an audit row, a mail, a job, an outbound
call, CPU. A weak key with a costly request is worse than a weak key with a free one (the payment
webhook, whose unauthenticated requests each write an audit row).

Anything in the top two rows is only acceptable when something else covers the
same route. Which brings the actual finding:

### 3 — the tells

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
- **Text naming a key the code does not use.** For each budget, compare with its `keyGenerator`,
  `skip*` and `requestWasSuccessful`:
    - `keyedBy`;
    - the docblock above the budget;
    - its `module.yaml` `bounds`;
    - the comment at its mount site (`routes.ts`, `module.ts`);
    - any key comment in the module's contract fragment;
    - its paragraph in `docs/tools/security.md`.

    Then grep `docs/theory/defences/*.md` and `docs/theory/data-protection.md` for `/24`, `/48`,
    `/56`, `/64`, `per address`, `keyed on`, `every limit`. Only claims about who is counted: a window,
    default or env-var mismatch gets one line, not a row. A document that says "per account" while the
    code keys on the address is a documented defence that does not exist.

- **A charged budget that declares `escalation`.** `chargeBudget` ignores it
  (`chargedStoreOf` reads only namespace, `onStoreError` and window), so the escalation is silently
  lost.

### 4 — classify

`sound` / `weak key, covered by a partner` / `deliberate weak key` / `WEAK KEY, UNCOVERED` /
`label drift`.

`deliberate weak key` must cite the comment that says so, and re-check that comment's premise
against the controller: what one request writes or spends. A premise nobody re-checked is not a
reason (RK-1: the payment webhook was "deliberate" on a cost premise nobody checked).

For a `WEAK KEY, UNCOVERED`, give the concrete bypass in one line: what the
attacker changes between requests, and what it costs.

## Output

Write `tmp/reports/audit-<run>/rate-limit-keys/<SCOPE>.md`:

| budget | namespace | key (file:line) | mounted on | partner budget | cost per request | verdict | bypass |

After it, a second table for the text rows, since prose is not one per budget:

| text (file:line) | says | the code (file:line) | budget |

Then print the `WEAK KEY, UNCOVERED` and `label drift` rows, cheapest bypass first.

Rules:

- `sound` rows stay in the table. A report that lists only accusations reads as a
  list of bugs; the table is what makes "23 of 25 are fine" legible.
- A weak key is NOT a finding when the route carries a partner budget that covers
  the same traffic. Name the partner and move on.
- A deliberate weak key gets the verdict `deliberate weak key`, with the comment that says so and
  the re-checked premise.
- A text row is reported, never fixed, and never turned into a proposed checker. Docs are kept by hand.
  The global browsing brake is address-keyed on purpose — it is a brake, not a
  gate, and it exists to slow a scanner rather than stop an attacker.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables.
