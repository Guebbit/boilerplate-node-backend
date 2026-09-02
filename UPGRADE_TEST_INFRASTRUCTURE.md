# Upgrade — contract-driven test generators

Two ideas raised while implementing X-2 (server-side password complexity — see the correlated
blind-spots audit rollup) but deliberately not built now: they touch shared test infrastructure
both repos rely on, and deserve a real design pass rather than a same-session patch. Written up
here so that pass has a starting point.

## 1. The pattern/fuzz-generator gap is a class of problem, not a one-off

**What happened.** `PasswordNew` (`shared/contracts/openapi.root.yaml`) needed a rule two
existing generators couldn't both satisfy:

- `tests/support/contract-data.ts`'s `validPayload()`/`invalidPayloads()` (used by
  `tests/contract/request-contract.test.ts`) already has an escape hatch for this —
  `PATTERN_SAMPLES`, a lookup of hand-provided strings for patterns its generic walker can't
  produce, with a loud `throw` when a new pattern has no entry.
- `tests/support/spec-arbitraries.ts`'s `stringArbitrary()` (used by the fuzz suite,
  `tests/fuzz/endpoints.fuzz.test.ts`) has no equivalent. It calls `fc.stringMatching(new
RegExp(schema.pattern))` unconditionally, and `fast-check` throws `Assertions of kind Lookahead
not implemented yet!` on any pattern using `(?=...)`/`(?!...)` — which is exactly what "must
  contain a lowercase letter, an uppercase letter, a digit and a symbol, in any order" needs.

**What was done instead.** `PasswordNew` carries the rule in prose only — no `pattern` — so
neither generator ever sees it, and `zodUserSchema` (`src/modules/users/model.ts`) enforces it by
hand. That sidesteps the crash but gives up a machine-checkable contract: any other tool that
reads `openapi.yaml` (Swagger UI, a future codegen target, an external client) gets the English
description and nothing else.

**The better fix.** Keep the real `pattern` on `PasswordNew`, and give `spec-arbitraries.ts` the
same kind of fallback `contract-data.ts` already has — catch the "Lookahead not implemented"
case (or detect a lookahead in the pattern source before calling `fc.stringMatching`) and
substitute a known-good literal, the same shape as `PATTERN_SAMPLES`.

**Further, if the design pass wants it: unify the two tables.** Right now a tricky pattern needs
a sample registered TWICE, in two files, with no shared source and no test that they'd agree if a
sample were added to one and not the other. A single exported table (e.g.
`tests/support/pattern-samples.ts`) that both `contract-data.ts` and `spec-arbitraries.ts` import
would mean a new `pattern` this repo can't cheaply generate strings for is documented once,
discovered once, and used by every generator that walks the contract — including any future one.

**Open questions for that pass:**

- Does `PATTERN_SAMPLES`'s "throw if no sample exists" discipline extend to the fuzz side, or
  does the fuzz suite want a softer fallback (skip the field, use `minLength`-only) given it runs
  against many more schema shapes per run?
- Is lookahead detection worth doing generically (a quick regex-source scan for `(?=`/`(?!`), or
  is per-pattern-source lookup (like `PATTERN_SAMPLES` already does, keyed on `pattern.source`)
  enough — it already degrades safely (loud error) for an unregistered pattern?
- Worth noting for calibration: some real-world API specs (Stripe, GitHub) don't encode password
  complexity as a JSON Schema `pattern` at all, for the same "no client can regex-validate a
  security rule usefully" reason — so a prose-only `PasswordNew` isn't unprecedented. The case for
  fixing this is tooling completeness (nothing that reads the contract sees the rule) more than
  "the current state is wrong."

## 2. Test credential/fixture literals duplicate instead of sharing

**What happened.** Across both repos, "a password that satisfies the current policy" is spelled
out as its own literal in each file that needs one, rather than drawn from one place:

- Backend already has `PLAIN_PASSWORD` (`src/modules/users/fixtures.ts`), built and documented
  specifically to satisfy the signup policy — but X-2's fixes introduced fresh literals anyway
  (`request-contract.test.ts`'s `withCompliantPassword`, `service.test.ts`'s `VALID_PASSWORD`,
  `self-service.test.ts`'s `NEW_PASSWORD`, `api.contract.test.ts`'s repeated
  `'Brand-New-Secret1'`) instead of importing it.
- Frontend's `tests/support/e2e/accounts.ts` documents its own drift risk in its own comment ("a
  second copy of a password is the kind of thing that drifts silently") and is read as a plain
  synchronous literal rather than resolved from `cy.env()` — unlike `apiUrl` and the Umami
  credentials in `cypress.config.ts`, which both flow through the `process.env.X ?? default` →
  `env:` block → `cy.env()` path this project already establishes as its convention for
  env-configurable test values.

**The better fix, backend side.** Standardize: any test that needs "a password that currently
satisfies the policy" imports `PLAIN_PASSWORD`, full stop — no new ad hoc literal, unless the
test's whole point is a specific string. A policy change (longer minimum, a fifth character
class) then means editing the fixture once, and every consuming test either keeps passing or
fails at the one place that defines what "valid" means, not at six unrelated call sites.

**The better fix, frontend side.** Wire `E2E_ACCOUNTS` through `cy.env()` the way `apiUrl` already
is — the `before()`-hook-resolves-into-a-module-scoped-cache pattern `commands.ts` already uses
for `injectedApiUrl` is a direct template. That was not done in this session's pass because it
touches command timing across the whole e2e suite (every spec depends on the hook having run
first) and deserved to be verified in its own change, not folded into a password-policy fix.

**Open questions for that pass:**

- Backend: is a single `PLAIN_PASSWORD` enough, or do some tests genuinely need distinct values
  (e.g. proving two different sessions don't share a password) — worth an audit of which of the
  X-2-introduced literals are load-bearing vs. copy-paste.
- Frontend: `E2E_ACCOUNTS` is read synchronously in several places (`loginAs`, `adminApi`, and now
  two `.cy.ts` specs that import it directly). Resolving it via `cy.env()` means either a
  `before()` hook in every consuming spec, or a single global one in `tests/support/e2e/e2e.ts`
  that every spec inherits — the latter is less repetitive but makes the dependency less visible
  at each call site. Worth deciding which failure mode (a spec that forgot the hook vs. a spec
  that's silently coupled to global setup order) is more acceptable here.
