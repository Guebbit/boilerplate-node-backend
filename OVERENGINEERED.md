# Over-engineered: defensive code that tests already cover

Scope: code whose main job is protecting a developer or operator from a configuration/wiring
mistake — a typo'd env var, a duplicated module name, a self-dependency, an unknown provider key.
That class of mistake breaks on the first boot or the first test run whether or not a guard exists
to name it nicely, so the guard is mostly there to make the failure message friendlier, not to make
the failure possible to catch. This does **not** include code guarding a genuine runtime condition
(a dependency being down, a malformed request, concurrent access) — that's real defensive
programming, and it's called out explicitly below as _not_ fitting.

Ranked strongest → weakest "delete this, a crash or a test will say the same thing anyway."

---

## 1. `src/kernel/registry.ts` — `validateModules` + the typed vocabulary around it

**What's there:** `src/modules.ts` is a 47-line hand-written file, ~13 `import` lines plus a
13-entry array. `registry.ts` wraps that array in ~230 lines of machinery:

- `validateModules` (lines 171–225): duplicate-name check, unknown-dependency check,
  self-dependency check, and a depth-first cycle detector that tracks the path so the error can
  print it.
- A typed vocabulary that exists to _describe_ the array: `ContextRelationship`
  (`conformist | customer-supplier | published-language | shared-kernel`), `Subdomain`
  (`core | supporting | generic`), a required one-sentence `because` on every dependency edge, and
  a `RoutedModule | HeadlessModule` union that uses `never` fields to make "router with no mount
  point" a type error.

**Why it's ceremony, not safety:** this manifest is edited by a human and reviewed in every PR. A
duplicate entry or a typo'd dependency name isn't a subtle bug that survives to production — it's
a copy-paste slip that breaks on the very next `npm test` or `npm start`. And it's checked
_repeatedly_: `tests/unit/kernel/registry.test.ts` (112 lines) exists specifically to exercise
`validateModules` — duplicate registration, missing dependency, self-dependency, 2-node cycle,
3-node cycle, a diamond that isn't a cycle — and four more cross-cutting suites
(`module-shape.test.ts`, `module-file-shapes.test.ts`, `module-subscriptions.test.ts`,
`subdomain-discipline.test.ts`, 477 lines combined) separately re-verify shape and classification
of every module. Nearly 600 lines of test exist to prove a validator behaves correctly, guarding an
array that's shorter than the test suite written for it.

One thing worth being precise about, because it undercuts the validator further: `dependsOn` has
**zero runtime consumers other than `validateModules` itself** (confirmed by grep — nothing else
reads it). It isn't derived from real `import` statements, so it can't actually prove two modules
don't cycle in practice; it only proves that a developer's self-reported `dependsOn` annotations
are internally consistent with each other. A real import cycle between two module files would
neither be caught nor prevented by this — it's validating documentation, not code.

**What's actually load-bearing:** the `AppModule` shape itself (`name`, `basePath`, `routes`,
`locales`, `seeds`, `subscribe`) is the real contract every module implements. Removing that would
cost real type safety, not just ceremony.

**Simpler version:**

```ts
export type AppModule = {
    name: string;
    basePath?: string;
    routes?: Router;
    locales?: string;
    seeds?: () => Promise<SeedOutcome[]>;
    subscribe?: () => void;
};

export const registerModules = (modules: AppModule[]) => {
    for (const m of modules) m.subscribe?.();
};
```

Drop `ContextRelationship`, `Subdomain`, `because`, the `RoutedModule`/`HeadlessModule` split, and
the duplicate/self-dependency/cycle checks along with the `dependsOn` field they validate. A
mis-wiring that matters (two routers on the same path, a handler reaching a module that was never
imported) still fails loudly — just from Express or a `ReferenceError`, one layer down, instead of
from a bespoke validator with a nicer error string.

---

## 2. `src/infrastructure/runtime/environment.ts` — the file you flagged

**What's there:** two ~10-line coercion helpers (`environmentNumber`, `environmentFlag`) and one
required-var check (`validateRequiredEnvironment`), wrapped in ~90 lines of JSDoc rebutting
alternatives nobody proposed in this codebase: why `Number(x ?? 30)` is wrong (answers `NaN` on a
typo), why bare `parseInt` is wrong (`"5mb"` parses as `5`), why base-10 matters (`"0900"`
shouldn't read as octal), why both `1/true/yes/on` and `0/false/no/off` are accepted.

**Why it's ceremony, not safety:** every failure mode the comments defend against — a blank JWT
secret, a malformed number, an unrecognized flag string — either throws at boot
(`validateRequiredEnvironment`, called first thing in `startServer`, `src/app.ts:64`) or produces a
wrong-but-visible value the first test touching that code path will fail on. Checked directly: a
blank `NODE_TOKEN_ACCESS` doesn't quietly work even without the guard — `getAccessTokenSecret()`
falls back to `''`, and `jsonwebtoken`'s own `jwt.sign` throws `secretOrPrivateKey must have a
value` on an empty secret, natively, one stack frame later, no custom check needed. None of this is
a mistake that reaches a customer; it's a mistake that reaches the first `npm test` run in CI,
identically, with or without the file.

**Simpler version:**

```ts
export const environmentNumber = (key: string, fallback: number) =>
    Number(process.env[key]) || fallback;

export const environmentFlag = (key: string, fallback: boolean) =>
    process.env[key] ? process.env[key] === 'true' : fallback;
```

Drop `validateRequiredEnvironment` entirely and let the first `jwt.sign()` call with an empty
secret throw its own error. The current version isn't _wrong_ — it's that ten lines of coercion
logic don't need ninety lines of comments rebutting alternatives, and the `min` parameter / whole-
string regex exist to catch a mistake (`NODE_PORT=abc`) that a failed request or a broken `/health`
check already reports just as clearly.

---

## 3. `src/modules/payments/providers/index.ts` — the explicit throw in `resolvePaymentProvider`

**What's there:** a `Record<string, PaymentProvider>` with exactly one entry (`fake`), and a lookup
that throws `Unknown payment provider "X" — known: fake` when `NODE_PAYMENT_PROVIDER` doesn't
match.

**Why it's ceremony, not safety:** for what ships today this is a dictionary of one. A typo'd env
var doesn't need a bespoke "known providers" message to fail loudly — `PROVIDERS[name]` coming back
`undefined` and the next `.charge()` call throwing `Cannot read properties of undefined` is also
loud, also fails the first payment-flow test, and costs zero lines.

**Counter-consideration (weakest fit of the three):** the `Record` shape itself isn't the problem —
it's a legitimate seam for the day this boilerplate ships a second provider (the file's own comment
says a real deployment adds `stripe.ts` and one registry line). Only the explicit custom `throw` is
redundant; the lookup table it wraps is fine as-is.

**Simpler version:** keep the `Record`, drop the explicit throw — an `undefined` provider being
used is already an error, just Node's own `TypeError` instead of a hand-written one.

---

## 4. `resolvePaymentProvider`'s twin — `src/infrastructure/observability/analytics/index.ts`

**What's there:** `resolveAnalyticsProvider` (lines 129–141) is #3 again, one tier up: a
`Record<string, AnalyticsProvider>` of three entries (`umami`, `posthog`, `none`), a lookup, and a
custom `throw new Error('Unknown analytics provider "X" — known: …')`. The comment above the
registry states the intent in so many words: _"A typo'd env value must fail loudly, not fall back."_

**Why it's ceremony, not safety:** the sentence is true and the throw is not what makes it true. The
provider is memoised on first use and every consumer immediately calls a method on it, so an
unresolved name is `undefined.track(...)` one frame later — loud, at the same moment, without the
custom message. It is a slightly better fit than #3 rather than a worse one, because `none` is
already a legal value: a deployment that wants analytics off has a spelling for it, so the
`undefined` branch is reachable only by a typo in `NODE_ANALYTICS_PROVIDER`, and a typo is a
first-boot failure by definition.

**Simpler version:** identical to #3 — keep the `Record`, drop the throw. Whatever is decided for
the payments registry should be decided here in the same commit; two copies of one pattern diverging
is how the `.ejs` suffix in `outbox-names` happened.

---

## 5. `tests/cross-cutting/context-map.test.ts` + `subdomain-discipline.test.ts` — the satellites of #1

**What's there:** 271 lines of test asserting properties of the manifest metadata that #1 proposes
deleting. `context-map.test.ts` (217 lines, 12 cases) checks that every `dependsOn` edge is real,
that every cross-module import is declared, that `as` is one of the four `ContextRelationship`
words, that `because` is a sentence, that `because` "names something reachable across the edge
rather than restating the edge", that no module depends on itself, that no sibling is declared
twice. `subdomain-discipline.test.ts` (54 lines) checks that every module classifies itself as
`core | supporting | generic` and that a `generic` one has no `domain/` folder.

**Why it's ceremony, not safety:** these do not survive #1 — they assert `dependsOn`, `as`,
`because` and `subdomain`, and all four fields are gone in the simpler `AppModule`. They are listed
separately because it is worth being explicit that #1's cost is not 230 lines of `registry.ts`
against 112 lines of `registry.test.ts`; it is that plus these, and the self-dependency and
duplicate-declaration cases here are a _third_ statement of two checks `validateModules` already
makes and `registry.test.ts` already exercises.

The one part that is genuinely more than #1's validator is the import-derived half: `context-map`
reads real `import` statements, so it can say "this edge is declared and nothing imports it" and
"this import crosses a boundary no edge declares". That is the half with teeth, and it is one
property — _a module imports only siblings it declares_ — which `eslint-plugin-boundaries` already
has the vocabulary to express, against a list it already maintains, reported at the offending line
instead of as a diff of two sets. The rest is the file holding a prose field to a prose standard:
`'gives every edge a reason, in a sentence'` is a test that fails when a developer writes a short
reason.

`subdomain-discipline.test.ts` disqualifies itself in its own docblock — _"In a boilerplate these
values are a worked example rather than a finding — a starter kit has no core domain, and the first
thing a real project does is re-decide them"_ — and then, one paragraph earlier, states that the
honesty of the classification _is not checked_ and is "a review question now, not a failing test".
A label nobody can be held to, guarded by a test that says so.

**Simpler version:** both files go with #1. If the import-derived property is wanted, it is a
`boundaries/element-types` entry, not 217 lines.

---

## 6. `tests/cross-cutting/docs-match-the-tree.test.ts` — a test that fails when a service grows

**What's there:** 297 lines parsing `docs/theory/layers.md` and `docs/theory/request-flow.md` and
asserting the tree matches the prose. The live case:

```ts
const actual = lineCount(onDisk(cited));
return actual === lines ? [] : [`layers.md says ${cited} is ${lines} lines; wc -l says ${actual}`];
```

Exact equality between `wc -l` on a service file and a number in a markdown table. Plus: every path
cited in the docs exists, the table has as many rows as its own sentence claims, the endpoint list
names controllers that exist and counts them against its own sentence.

**Why it's ceremony, not safety:** this is the clearest case in the repository of machinery whose
failures are neither developer errors nor loud ones — they are _someone else's correct commit_.
Adding a line to `orders/service.ts` turns the suite red, and the fix is to edit a documentation
table. It is a tax on every refactor, charged for the accuracy of a number whose only purpose is
rhetorical: `layers.md` cites line counts to make an argument about service size, and the argument
survives the number being approximate. The docblock's own defence — _"a published number with no
guard behind it drifts from the file it describes"_ — is an argument for not publishing the number,
which the page could do at no cost by saying "over the threshold" instead of "582".

The path-existence cases are the salvageable third: a doc citing a file that was renamed is a
genuine broken reference. That is what a markdown link checker does, in zero lines of bespoke
parsing, across all of `docs/` rather than two pages.

**Simpler version:** delete the file. Rewrite the two tables to name the files without the counts,
and if broken references matter, add a link checker to `complete`.

---

## 7. The convention-spelling tests — `controller-naming`, `module-file-shapes`, `service-namespaces`, `generated-type-shadowing`

**What's there:** 403 lines across four files enforcing how things are spelled and where they sit.
`controller-naming` (64) requires `<verb>-<thing>.ts`. `module-file-shapes` (113) holds every file
in a module folder to a catalogue of allowed filename patterns. `service-namespaces` (109) requires
one `*Service` object per module holding every exported function. `generated-type-shadowing` (117)
forbids a handwritten `interface` carrying the name of an orval-generated type, with an allowlist of
exceptions and their reasons.

**Why it's ceremony:** these are the _first_ half of what you asked for rather than the second —
none guards a mistake that fails loudly, because none guards a mistake that fails at all. A
controller named `addresses.ts` serves the same requests. A file in a module folder that no pattern
matches still compiles, still runs. Two of them say so themselves: `service-namespaces` opens with
_"Both styles work, which is exactly why the split survived — nothing failed"_, and
`controller-naming` states its own value as _"a reader looking for the handler can find the file by
guessing its name"_ — a real benefit, and a review comment's worth of one.

`generated-type-shadowing` is the strongest of the four and still does not survive the test: a
handwritten `FacetCount` that has drifted from the contract's `FacetCount` breaks at the call site
the moment the two shapes disagree in a way that matters, because the contract's version is what
every generated client and the paired frontend use. Until then, the duplication is a naming
complaint. The file also carries the pattern #1 flags — a hand-maintained allowlist of exceptions,
each with a written reason, and a case (`'keeps the allowances honest'`) that exists to check the
allowlist has not outlived its entries. An allowlist that needs a guard is a list that has become
a small database.

**Simpler version:** delete all four. `controller-naming` and `module-file-shapes` are `ls` and a
reviewer. `service-namespaces` is a convention the next module copies from the last one.
`generated-type-shadowing` is one sentence in `docs/reference/`.

---

## 8. `tests/cross-cutting/published-language.test.ts` + `published-repositories.test.ts` — barrel hygiene, with essays

**What's there:** 369 lines asserting that a module's `index.ts` exports exactly what a sibling
imports. `published-language` (124) fails any export no other module reaches, and any barrel on a
module nothing imports. `published-repositories` (245) adds a second regime for repository exports
specifically: each needs a production caller _and_ a hand-written reason, the reason must be a
sentence, and a further case removes reasons whose repository has stopped being published.

**Why it's ceremony:** an unused export is not a bug in any sense the running system can detect —
it is dead weight, which a dead-code tool reports off the shelf over the whole tree instead of over
thirteen `index.ts` files. `published-repositories` is
where it tips over: the argument in its docblock (a published repository hands a sibling write
access to a collection it does not own, bypassing every rule the service carries) is _correct and
important_, and the enforcement it gets is a prose field held to `/[.!?]$/`. The rule that has teeth
is already there and is structural — a module with no `index.ts` cannot be imported at all, because
`eslint-plugin-boundaries` refuses the path. Whether the barrel that does exist should also export
`orderRepository` is exactly the judgement call the file admits it cannot make, so it asks for a
sentence instead and checks the sentence's punctuation.

**Simpler version:** delete both. For the repository half, keep the _decision_ — the barrels are already correct — and delete the 245 lines that re-litigate
it on every test run.

---

## 9. `tests/cross-cutting/tier-walls.test.ts` — the third copy of a rule

**What's there:** 113 lines re-checking, as source text, the tier boundaries that
`eslint-plugin-boundaries` refuses and `dependency-cruiser` re-checks transitively.

**Why it's ceremony:** the file states the overlap up front and offers two defences, and `&&` in
`package.json` disposes of both. `complete` is `ts-check && lint && … && check:dependencies && test`
— the linter and dependency-cruiser both run _before_ the suite and short-circuit it, so this file
cannot run in the gate without both having already passed. The second defence — _"this suite runs in
`npm test`, which is what a contributor runs"_ — describes a contributor who runs `npm test` and not
`npm run complete`, on a repo whose pre-commit hook runs `complete`.

The one thing it can see that a graph cannot is a tier named in a _string_ rather than an import: a
container key, a config value, a dynamic specifier. Sweeping `src/` for one turns up 36 hits and not
a single wall crossing among them — they are multi-line import continuations, `jest.mock()` calls in
co-located specs, `declare module '@kernel/events'` blocks, and dynamic `import()` specifiers, and
ESLint's own parser sees the last two. So this is 113 lines of coverage for a hypothesis, held
against a tree that has not produced an instance of it.

**Simpler version:** delete it, or reduce it to the string case alone — the two-line regex sweep
that is genuinely outside what the linter parses.

---

## The pattern underneath most of these: the canary, and the reason field

Two habits recur across `tests/cross-cutting/` and account for a large share of what makes the
directory 5,816 lines. Neither is wrong in isolation; both are worth naming, because they are what a
new guard file costs by default.

**The canary.** Thirty-three cases across the directory exist only to assert that the case below
them is not vacuous — `'finds the controllers it means to check'`, `'actually reads the module
tree'`, `'sweeps a source tree that actually has files in it'`, `'exist in more than name, so the
assertions below are not vacuous'`. Every filesystem-sweeping guard has one. They are a rational
response to a real failure (a sweep that finds nothing passes), and they are also the tell: a guard
whose subject has to be counted before it can be trusted is a guard reading the tree rather than the
code. An `expect(files.length).toBeGreaterThan(0)` on the first line of the real case costs one line
and no test name.

**The reason field.** Eight files require a hand-written prose justification on each allowlist entry,
and then assert properties of the prose: `context-map` (`'gives every edge a reason, in a
sentence'`), `published-repositories`, `side-effects-have-one-layer`, `credential-fields`,
`frontend-pairing`, `audit-actions`, `generated-type-shadowing`, plus `because` in the manifests
themselves. Several go further and check the allowlist for entries whose subject no longer exists —
a guard on the guard. This is the same mechanism as #1's `because`, generalised: where a rule has a
judgement call at its edge, the codebase's answer is to demand a sentence and then verify the
sentence ends in a full stop. The sentence is worth writing. Asserting its shape is asserting that
someone typed something.

---

## Looked at, deliberately excluded: `managed-connection.ts`

`src/infrastructure/runtime/managed-connection.ts` (260 lines: memoized handle, deduplicated
in-flight connect, a warn-once latch, a `state()` machine, graceful `stop()`) is the largest file in
this area and the most tempting to add on size alone. It's left out on purpose: it isn't guarding a
_developer_ mistake — it's guarding Redis or RabbitMQ genuinely being unreachable, which is an
operational fact no test run can pre-empt and which happens in production regardless of how careful
the config is. It also replaced two adapters that used to each reimplement this slightly
differently and disagreed about what "connecting" meant in the same health payload — that's real
duplication being removed, not ceremony being added. If there's a complaint about this file, it's
"is 260 lines the right size for two callers," which is a different question than the one this note
answers.

## Also looked at across `tests/cross-cutting/`, and deliberately excluded

The directory is 5,816 lines over 38 files, and the items above account for about a third of it.
The rest was read and rejected, for the reason the header states: a guard on a genuine runtime or
cross-repo condition is not ceremony, however much it looks like the ones that are. Grouped by why.

**Silent wrong data or wrong copy — no other layer reports these.**
`credential-fields` (165) drives a real Mongoose transform and is the only thing standing between a
password hash and a response body; `select: false` demonstrably does not cover it, and the login
path selects `+password` on purpose. `search-regex` (136) covers unescaped client text reaching
MongoDB's `$regex` on two unauthenticated endpoints — a remote DoS, not a typo.
`paginated-sort-is-total` (87) catches a `$sort` whose ties let a paged read return one document
twice and skip another; it already found a live case in an aggregation pipeline.
`locale-parity` (67), `locale-namespaces` (95) and `mail-copy` (239) each catch copy that goes
missing without an error — a raw key printed to a user, a module silently overwriting a shared
string, an EJS variable no builder supplies.

**Identifiers shared with something outside this repository.** `metric-names` (223) guards names
that Grafana dashboards and alerts hold by string and that cannot be refactored with the code — the
failure is a chart that goes flat, noticed weeks later. `outbox-names` (151) and
`seed-conformance` (415) and the `scripts/spec-identity.ts` pair are the same shape across the
frontend and PHP twins: a fork in a shared file is valid on both sides and reported by neither.
`contract-*` (869 across five files) hold `openapi.yaml` fragments to each other; the bundle is
generated and consumed by a client generator in another repo.

**Genuinely invisible wiring.** `module-subscriptions` (129) is the one manifest-adjacent file that
survives #1: `subscribe()` is pure behaviour, nothing else in the suite calls it, and an emptied
body leaves a module that registers, routes and passes every other check while silently no longer
reacting to anything. Its last case (`'listens only to events from itself or a module it
declares'`) reads `dependsOn` and does go with #1; the first two do not.
`authenticated-controllers` (95) catches a controller reading `authContextOf` on a public route,
and the hazard it names is real and specific — `feedback` calls `router.use(isAuth)` _mid-file_, so
a route appended above that line is public and looks identical to one that is not.
`probes-are-wired` (53) covers a hand-maintained `Partial<Record<…>>` where an omission is legal by
construction.

**Meta-gates that fail by going quiet.** `coverage-thresholds` (71) and `ci-covers-the-gate` (111)
are the awkward pair: both are machinery about the build rather than about the product, which is the
shape of ceremony — and both guard a check that has _stopped running_ while still reading as green,
which is the one failure mode nothing louder exists for. Jest silently ignores a `coverageThreshold`
key matching no file, and it had detached three times over, leaving 203 of 275 source files under no
floor. Left in, with the note that they are the weakest keeps here rather than the strongest.

**`frontend-pairing` (149)** — half hand-maintained map, half real cross-repo check, and the real
half no-ops when the sibling is not checked out (loudly, by design). Trim rather than delete: the
cases that hold the map to _this_ repo's module list are #1's territory and go with it; the ones
that read the sibling are the reason the file exists.

**`eslint/rules/*` (329)** — worth recording as the counter-example this repo already produced.
`controller-chain-must-catch` and `no-hardcoded-user-text` _used to be_ cross-cutting tests, one
grepping for `.catch(`, the other carrying a 60-line hand-written tokenizer to read one argument of
one call. Both are now lint rules: parsed AST, reported at the line, visible in the editor. That is
the shape most of the deletions above should take if the property behind them is worth keeping at
all.

---

## Applied — 2026-08-29

Everything above was carried out. `npm run complete` passes: `tsc`, ESLint (`--max-warnings 0`), the
four spec linters, `check:contracts-bundle`, `check:seed-export`, `check:spec-identity`,
`check:dependencies` (703 modules, no violations), and all five test suites — **3,141 tests green**.

|                                   | Files             | Lines removed     |
| --------------------------------- | ----------------- | ----------------- |
| Production code (`src/`)          | 20 changed        | −467, +72         |
| Test files deleted                | 12                | −1,634            |
| Docs and remaining tests reworked | 20                | —                 |
| **`tests/cross-cutting/`**        | **38 → 27 files** | **5,816 → 4,133** |

Net across the change: **−2,564 / +311**.

### What was done

- **#1** `kernel/registry.ts` 239 → 111 lines. `validateModules`, `ContextRelationship`,
  `ContextEdge`, `Subdomain`, and the `RoutedModule`/`HeadlessModule` split are gone, along with the
  `dependsOn` and `subdomain` fields on all 13 manifests. `registerModules` is now the two-line loop.
- **#2** `environment.ts` 101 → 52 lines; `validateRequiredEnvironment` deleted and removed from the
  boot chain in `app.ts`.
- **#3 / #4** Both provider registries keep their `Record` and lost their custom `throw`.
- **#5–#9** Twelve test files deleted (the ten argued for, plus `module-shape.test.ts` and
  `tests/unit/kernel/registry.test.ts` named in the original Net). `module-subscriptions` and
  `frontend-pairing` trimmed rather than deleted, as the exclusions section proposed.
- Docs: `strategic-ddd.md` §2/§4/§5 rewritten (the context map now lives in each module's docblock,
  and the page says what the field was and why it went), `layers.md`'s over-threshold table stripped
  of its line counts, `modules.md`, `module-lifecycle.md`, `reading-path.md`, `domain-layer.md`,
  `tests.md`, `src-modules.md`, `src-app.md`, `observability-layer.md` and four `docs/modules/`
  pages updated. Five cross-page anchors repointed.

### Follow-up: two more guards handed to the standard tool

Asked whether anything left in the repo reinvents what `dependency-cruiser` already does, two did.
Both were promoted rather than merely deleted, because the tool answers a strictly stronger question
than the hand-rolled version did.

**`unit-layer-is-framework-free.test.ts` (58 lines) → `unit-layer-stays-database-free`.** The test
text-matched three strings in each spec. The rule asks whether a spec can **reach** a database, so it
catches the way the violation actually arrives — a spec importing a helper that already had one.
Proven by probe: a `tests/unit/` file importing a helper that imports `@tests/database` names none of
the three strings, so **the test passed and dep-cruiser caught it**, naming both files.

**`auth-surface.test.ts`'s second `describe` (~30 lines) → `module-internals-are-private`.** It swept
`src/` for files outside `account` reaching past its barrel — for that one module. Its docblock
justified itself by naming four directories (`src/middlewares/`, `src/bootstrap/`, `src/jobs/`,
`src/workers/`) that **no longer exist**. But the gap it named is real and I nearly deleted it on the
assumption ESLint covered it: probing `src/app/` → `@modules/account/session/jwt` gives
`eslint --max-warnings 0` **exit 0**. `eslint-plugin-boundaries` refuses a _module_ reaching a
sibling's internals and says nothing about the tiers that are not modules. The rule now covers all
thirteen from every non-module tier.

**And the coupling question from §5 is now actually answered.** `MODULE_EDGES` in
`.dependency-cruiser.cjs` is the enforceable half of what `dependsOn` declared — one map, thirteen
generated rules, reported at the offending import. Verified both ways: passes as the tree stands,
and refuses an injected `feedback → products`. The prose half stays in each `module.ts` docblock,
which is the half that can hold a coupling the import graph cannot see.

`required` rules were considered and declined, with the reasoning recorded in the config header so
the next reader knows the feature exists and that the decision was deliberate.

One thing this cost, worth stating: `check:dependencies` now cruises `src tests` rather than `src`,
because the unit-layer rule needs the test tree in scope.

### Two things worth recording, because neither was predicted above

**A ceremony test was propping up a coverage number.** Deleting `service-namespaces.test.ts` dropped
`account/services/index.ts` and `cart/services/index.ts` below their coverage floors — from 70%+ to
18% and 0% functions. The test never asserted anything about those barrels; it did
`await import(file)` on each one to enumerate the namespace, and executing a barrel's re-export
arrows is enough to mark them covered. The floors were being met by an import side effect of a test
about naming. That is the thesis of this document arriving from an unexpected direction: the
ceremony was not merely useless, it was concealing that two files had no unit coverage at all.

For scale, that coverage job reports **89 threshold failures on `main` before any of this** — it is
already red and not a gate anything runs (`test:unit:coverage` is not in `complete`). The two new
entries are an honest reading of a number that was previously wrong.

**One real type-safety loss, accepted knowingly.** `RoutedModule | HeadlessModule` made "a router
with no mount point" a compile error. With one flat optional type it is not, so `app/routes.ts` now
mounts on `if (basePath && routes)` instead of `if (routes)`. The failure mode moves from a type
error to a module that serves nothing — which is what a router with no mount point was always going
to do at runtime anyway, and is visible on the first request to the missing path. §1's simpler
`AppModule` predicted this trade; it is recorded here because it is the only place in the whole
change where something was genuinely given up.

The claim that survived best: `dependsOn` had no runtime consumer. Removing it and all 13 manifests'
edges required **zero** changes to any service, controller, repository or router — only to the tests
and docs that described it.

---

## Net

Two buckets, and they are not the same argument.

**Guards on a mistake that fails loudly anyway** — #1, #2, #3, #4. Roughly 250 lines of production
code, plus `tests/unit/kernel/registry.test.ts` (112) and the cross-cutting suites that assert
manifest metadata (`module-shape`, `module-file-shapes`, `subdomain-discipline`, `context-map`, and
two of the four cases in `module-subscriptions`) shrinking or disappearing with it. None of the
failure modes survive the first boot
or the first test run: they fail one layer down, from Express, a native `TypeError`, or
`jsonwebtoken`, instead of from a hand-written check with a friendlier message.

**Ceremony that guards nothing that fails at all** — #5 through #9, and the two habits in the
section above. This is the larger number and the softer argument: nothing here is protecting the
running system, so deleting it costs no safety, only convention. Approximate line counts:

| Item                                                                                           | Lines |
| ---------------------------------------------------------------------------------------------- | ----- |
| #5 `context-map` + `subdomain-discipline` (fall with #1)                                       | 271   |
| #6 `docs-match-the-tree`                                                                       | 297   |
| #7 `controller-naming`, `module-file-shapes`, `service-namespaces`, `generated-type-shadowing` | 403   |
| #8 `published-language` + `published-repositories`                                             | 369   |
| #9 `tier-walls`                                                                                | 113   |

About 1,450 lines of test, roughly a quarter of `tests/cross-cutting/`, none of which can report a
defect a user or an operator would ever see. Two of them — `published-language` and
`generated-type-shadowing` — are asking a dead-code question over thirteen files that belongs to the
whole tree; one — `tier-walls` — is the third enforcement of a rule that runs twice before it in
the same `&&` chain; one — `docs-match-the-tree` — turns the suite red when a correct refactor
adds a line to a service.

The thing worth keeping from all of it is the move the repo has already made once: two of these
properties left this directory to become ESLint rules and got _better_ — parsed AST instead of a
hand-rolled tokenizer, reported at the line instead of as a diff of two sets, visible while the code
is being written. Where
a property here is genuinely worth enforcing, that is the shape it should take. Where it is a
judgement call at the edge of a rule, the current answer is to demand a written reason and then
assert the reason is a sentence — and that is the ceremony, not the reason.
