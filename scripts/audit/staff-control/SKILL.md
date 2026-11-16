---
name: staff-control
description: Audit money and outside-world flows for the house rule — alert staff and give them the instrument, never a per-case automation that could be wrong or fragile
---

Before anything else, read `scripts/audit/RULES.md` and follow it. Where this skill and RULES.md
disagree, RULES.md wins.

ROLE: Operations reviewer. You do not ask whether a flow is correct — its tests answer that. You ask
what happens when the flow does NOT finish cleanly: does a human hear, and can a human finish the job?

GOAL: Find money and outside-world flows that fail silently, strand a record, decide too much on their
own, or alert staff who then have nothing to act with.

## The rule being audited

The user's rule: money-related things, and things with "too many external variables" (shipping,
returns), must not get an over-engineered code solution per case — it can be wrong or fragile. Alert
the staff and give them the instruments to manage the occurrence, with enough information to make the
call safely. A human in control beats a clever branch.

Not a finding: a guardrail against an administrator's own choices (`CLAUDE.md` § Scope). Only
consistency breaks count: a dangling reference, money or stock that no longer adds up.

SCOPE: the argument you were given: a module name (`payments`), a path, `--diff` or `whole-repo`
(`scripts/audit/RULES.md` rule 5). Empty means `whole-repo`, narrowed to these flows (say so at the
top): `payments` (refunds, disputes, provider webhooks, settlement, reconciliation), `delivery`,
`returns`, `invoicing`, `inventory` moves tied to them, `orders` cancel and refund paths, and
inbound and outbound `webhooks`.

## Naming the scope

Output goes to `tmp/reports/audit-<run>/staff-control/<SCOPE>…`. `<run>` and `<SCOPE>` are defined in
RULES.md rule 4.

## The four classes

| Class | Name               | The tell                                                                                                                                                                                |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Silent give-up     | A failure or edge path ends with no staff-visible trace: no alert, no staff task or notice, no attention-list entry, no audit row. At most a log line.                                  |
| B     | Stuck state        | A record can reach a state that no automatic path AND no staff action can leave (a refund refused as `disputed` by the provider, with no dispute record).                               |
| C     | Fragile automation | Per-case automatic decisions on money or outside facts (retry, reconcile, auto-resolve branches that assume provider behaviour) where record + alert + staff action is the safer shape. |
| D     | Missing instrument | An alert exists but staff have no screen or action to act on it, or no guide entry says what to do.                                                                                     |

A log line alone is not a trace: nobody reads it unless an alert rule watches it (step 1).

## Steps

### 0 — the previous run (RULES.md rule 8)

Read the newest older `tmp/reports/audit-*/staff-control/` folder, of any scope. Never write to it.
Carry no verdict without re-opening its `file:line`; report every earlier row under rule 8.

### 1 — inventory the existing staff channels

Find them in the code; do not assume this list is complete or current. Start from:

- `shop-tasks`: the to-dos a payment, stock or delivery situation opens, the staff work notices and the
  staff digest (`src/modules/shop-tasks/domain/openings.ts`, `services/notices.ts`, `services/digest.ts`).
- `payments`: the attention view (`controllers/get-payment-attention.ts`, `services/list.ts`) and the
  staff doors in its `routes.ts` with their permissions.
- `notifications`: the inbox and `staff-routing.ts` (who is told, how).
- `audit-logs`: what is written, and what staff can filter.
- Prometheus: the rules in `docker/observability/prometheus.alert-rules.yaml`, and which log lines or
  metrics they watch.
- The staff guide entries under `docs/` for each of the above.

Write the inventory as a table at the top of the report: channel · what it carries · who sees it ·
`file:line`. Every finding later points at a row here, or says no channel fits.

### 2 — list the exits of each flow

For each flow in scope, every way it ends without the happy result: provider error or timeout, webhook
that never arrives, arrives twice or out of order, a partial write, retries exhausted, a record in a
state with no matching record, a write that loses a race. Cite the `file:line` of the branch that
handles it, or record that there is none. Read the loop or the branch; never count retries by text
search, and treat a comment promising "left to retry" as a claim until the retry is found.

### 3 — classify each exit

- Class A: which channel in the inventory should have heard, and did it? Log-only is a finding.
- Class B: walk every transition out of the state (code and staff doors). None leaves it → finding.
- Class C: count the branches, the provider assumptions they make, and which branches a test covers.
  Many branches, assumed provider behaviour and thin tests → finding. One bounded, idempotent retry is
  not.
- Class D: for each alert, find the staff door and the guide entry that let a person act on it.

An exit that is heard, escapable, simply handled and actionable is `covered`: list it, with no finding.

### 4 — the suggestion

Always in the "inform + instrument" shape: a notice or task to open, an attention-list entry, a staff
door to add or expose, a guide line, or an automatic branch to remove. Never propose a new reconciler
or auto-resolver as the fix. A suggestion that touches money is the user's call: say so.

## Output

Write `tmp/reports/audit-<run>/staff-control/<SCOPE>.md`: the channel inventory, then one row per finding:

| id | class A-D | file:line | what happens today | what staff see | instrument that exists | suggestion | severity |

- `id`: `SC-<n>`, stable within the report.
- `severity`: `money lost` / `money misreported` / `staff blind` / `cosmetic`.
- `covered` rows stay in a second table (flow · exit · channel · door): a report of accusations only
  cannot show how much is already fine.

Then print the findings, money-lost first.

Rules:

- Report, never fix: no code, test, doc or plan is edited (RULES.md rule 1).
- A row without a `file:line` is `not traced`, not a finding.
- `tmp/reports/` is gitignored; these files are working evidence, not deliverables.
