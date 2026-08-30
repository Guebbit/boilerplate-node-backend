# Infrastructure layout plan

Why `src/infrastructure/http` accretes, which of its neighbours quietly contradict their own
documented rules, and what each fix costs. Written 2026-08-30. This is a backlog with verdicts, in
the shape of `CONTRACT_PLAN_POLYMORPHISM.md`.

**Read the theory first if you have not:** `docs/theory/layers.md` is the authority on what each
tier and each infrastructure folder is _for_. This file does not restate it; it records where the
tree has drifted from it and what to do about that.

---

## Status — 2026-08-30, executed

Steps 1-4 are done in the working tree, uncommitted, awaiting review. Step 5 stays deferred as
written. Two things moved under this plan's own feet between when it was drafted and when it was
executed — both same-day, both worth recording rather than silently smoothing over:

- **`http/controller.ts` was never part of the moving group.** The plan's original "Controller
  factories" table (below, kept for the record) named `controller.ts`, `delete-controller.ts` and
  `search-controller.ts` as one group of three. By the time this was executed, an unrelated same-day
  commit (`d45c5506`) had already split that world in two: `controller.ts` holds `refused`,
  `catchAs`, `rejectValidation`, `parseBody` — generic per-controller helpers with 53 importers
  across every module — and is **not** a factory; the actual factories (`create-delete-controller.ts`
  plus two new ones, `create-item-controller.ts` and `create-list-controller.ts`, added the same day
  by `ff828ffa`) are the ones that know service envelopes, audit actions and not-found keys, with 10
  importers between them. `controller.ts` stays in `http/` — it takes an Express `Response` on every
  export, which is exactly what `http`'s new admission test (step 1) asks. Only the four factories
  moved. This also means the `eslint.config.ts:530` edit step 3 called for never happened: that rule
  guards `@infrastructure/http/controller`, which did not move.
- **The folder name settled on `surfaces/`, not `controllers/` or `controller-factories/`.**
  `controllers/` was the name step 3 flagged as tempting but mechanism-shaped — the same trap
  `middlewares/`, `jobs/` and `workers/` were dissolved for. It has a second problem this plan didn't
  originally name: every module already owns a `controllers/` folder of its own
  (`src/modules/<name>/controllers/`), so an infrastructure-level `controllers/` would be a homonym
  across tiers, the exact "two things, one name" complaint step 4 raises about `security.ts` and
  `cache.ts`. The first landing spot, `controller-factories/`, dodged both problems but read as an
  invented compound on review. `surfaces/` does not invent anything: `RequestSurface` and
  `SURFACE_SOURCES` in `http/request.ts`, and `docs/theory/request-input.md`, already name exactly
  this concept — which route surface a controller is (`delete`, `search`, `list`, a path-keyed read)
  — and the four factories are one shared implementation per surface. Filenames are unchanged; only
  the containing folder's name is the repo's own existing word for what they group.

Numbers below (import-site counts, LOC, coverage floors) are restated at their **measured** values
where execution found them different from the estimate.

**Gate.** `npm run complete` — ts-check, ESLint, `check:dependencies`, spectral (OpenAPI +
AsyncAPI), Prettier, contract-bundle/seed-export/spec-identity checks, docs-graph check,
`docs:build`, and the full test suite — passes clean against the moved tree: 214 suites total across
unit (124), cross-cutting (26), integration (48), contract (15) and fuzz (1), zero failures. Ran
twice; the first pass caught four Prettier-unformatted files from this change (fixed with `npx
prettier --write`), the second was clean end to end. Nothing has been committed — `git status`
below is the full uncommitted diff for review.

---

## The finding

The taxonomy is already written down. `docs/theory/layers.md:225-235` gives every infrastructure
folder a stated "main job", and `layers.md:199-213` records the migration that produced them —
`src/middlewares/`, `src/jobs/`, `src/workers/`, `src/routes/`, `src/core/` and `src/platform/` were
all dissolved on the same principle:

> Each was a directory named after a MECHANISM rather than a tier.

So the problem is not a missing convention. The problem is that `http` is the one folder that
breaks the convention it was created by, and that two of its neighbours fail their own admission
tests.

### `http` is named for a protocol, its siblings are named for a job

| Folder          | The question its name answers |
| --------------- | ----------------------------- |
| `runtime`       | _when_ — runs once at startup |
| `adapters`      | _what it owns_ — external I/O |
| `observability` | _what it produces_ — signals  |
| `persistence`   | _which substrate_ — mongoose  |
| `http`          | _which protocol_              |

The first four give a test a file can fail. `http` gives "does it touch Express", which at the edge
of a web application is true of nearly everything — so nothing can be refused, and the folder
accretes. That is the entire mechanism of the drift.

It already fails even that weak test. **Three of its fifteen files never import Express:**
`schemas.ts`, `validation-messages.ts` and `middlewares/rate-limit-store.ts`. And
`response.ts`'s own header records that `generateSuccess` was split from `successResponse`
precisely so the envelope can be built with no Express `Response` in hand — workers do exactly
that.

### What is actually in there

2,437 LOC across 15 files — **29% of all of `src/infrastructure`** (8,404 LOC) — at four different
altitudes:

| Group                | Files                                                              |   LOC |
| -------------------- | ------------------------------------------------------------------ | ----: |
| Controller factories | `controller.ts`, `delete-controller.ts`, `search-controller.ts`    |   311 |
| The wire dialect     | `response.ts`, `errors.ts`, `schemas.ts`, `validation-messages.ts` |   593 |
| Input decoding       | `request.ts`, `uploads.ts`                                         |   505 |
| The pipeline         | `middlewares/*` (6 files)                                          | 1,028 |

Only the first group is genuinely misfiled. It knows service envelopes, audit actions and
not-found keys — that is application convention, a rung above technical substrate. It is also the
newest arrival and still growing: `search-controller.ts` was uncommitted in the working tree on the
day this was written.

Remove that group and the remaining three are one coherent job — express request in, express
response out, pipeline between — and the name `http` becomes accurate rather than generic. **That
is why this plan does not rename `http`. It narrows it.**

---

## Two neighbours contradict their own documentation

### `adapters` — a docs bug, not a code bug

`layers.md:231` describes it as "clients owning an external connection". `filesystem.ts`,
`image-signatures.ts` and `demo-outbox.ts` own no connection. The files are correctly placed; the
sentence is too narrow. Widening it to _"the substrate's I/O — anything that talks to something
outside this process"_ admits all three honestly, `demo-outbox.ts` included as the fake half of the
mailer.

**No file moves for this one.** Only the table row changes.

### `runtime/managed-connection.ts` — genuinely misfiled

`runtime` is documented as "runs once at startup". `managed-connection.ts` runs no startup step: it
is a library imported by `adapters/cache.ts:20`, `adapters/queue.ts:20` and
`http/middlewares/rate-limit-store.ts:49`. 260 LOC, three import sites.

### `i18n` is not in the table at all

Six folders exist under `src/infrastructure`; `layers.md:229-235` documents five. That omission is
the hole a seventh undocumented folder grows in, and it is the cheapest thing on this list to fix.

---

## Smaller inconsistencies

Recorded so they are not rediscovered; none is urgent on its own.

- ~~**`http/middlewares/security.ts` is rate limiting only**~~ — **resolved by step 4**: renamed to
  `rate-limit.ts`, so the collision with `app/security.ts` is gone. `isMetricsScraper` — the
  metrics-scraper bypass — still rides along in the same file and is still not rate limiting; that
  half of the original complaint was never in step 4's scope and stays open.
- **Duplicate basenames across layers.** `cache.ts` exists twice (`adapters/` 367 LOC,
  `http/middlewares/` 455 LOC); metrics are spread over `observability/metrics-cache.ts`,
  `observability/metrics-http.ts` and `persistence/metrics.ts` — three files, two naming schemes,
  two folders. Import lines cannot be read without their full path.
- **Two shapes for one port pattern.** `observability/analytics/` is a directory with an `index.ts`
  and three implementations; `adapters/image-store.ts` is a port plus its implementation in one
  file. Same pattern, no written threshold for when one becomes the other.
- **Two files past the repo's own size rule.** `request.ts` (429) and `middlewares/cache.ts` (455)
  both exceed the ~300-line split rule at `layers.md:104`. That rule is scoped to module services,
  so this is an observation rather than a violation — but both files are larger than several whole
  infrastructure folders.

---

## The plan

Ordered by cost. Steps 1-4 are the recommendation; step 5 is deliberately deferred. Take them as
separate commits — the pre-commit hook runs `regenerate-artifacts` plus the full `complete` gate,
so batching them makes a failure hard to attribute (allow ~10 minutes per commit).

Use `git mv` throughout, so history follows the file.

### 1. Write down the admission tests — docs only

**What.** In `docs/theory/layers.md`, give each infrastructure folder a second line saying what it
_refuses_, not just what it holds. Add the missing `i18n` row. Widen the `adapters` row per the
finding above.

**Why.** Every other step on this list is cleanup of damage this omission already caused. A "main
job" phrase describes the contents; an admission test lets the next reviewer reject a file. This is
the only step that prevents recurrence, which is why it goes first rather than last.

**Suggested tests** (wording to settle when writing):

| Folder          | Refuses                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `runtime`       | anything a request can reach — this runs at boot and at shutdown, not per call |
| `adapters`      | anything that talks only to this process's own memory                          |
| `observability` | anything a caller reads back — signals go out, they are not an API             |
| `http`          | anything that would still make sense with no `Request` and no `Response`       |
| `persistence`   | anything that knows what a document _means_                                    |
| `i18n`          | copy itself — it resolves a language, `src/locales` holds the words            |

**Cost.** One file. No code, no imports, no gate risk beyond `npm run docs:build`.

**Done.** `docs/theory/layers.md`'s folder table carries a `Refuses` column now, at essentially the
suggested wording — the `http` row grew one clause beyond the draft above: it also refuses
"anything that knows a service envelope, an audit action or a not-found key", which is the actual
test step 3 needed and the draft's `Request`/`Response` wording alone didn't state (the controller
factories all take a `Response` too — they don't fail on that test, they fail on this one).
`docs/reference/src-infrastructure.md` had the same "five groups, i18n missing" hole one level
down (its own mermaid diagram and heading said "five" while an `i18n/` section already existed in
the file) — fixed alongside since it was the same drift step 1 was written to name.

### 2. `runtime/managed-connection.ts` → `adapters/managed-connection.ts`

**What.** Move the file and its test
(`tests/unit/infrastructure/runtime/managed-connection.test.ts` →
`tests/unit/infrastructure/adapters/`).

**Why.** It fails `runtime`'s own stated test and passes `adapters`' — it is the shared lifecycle
machinery two adapters are built from, not a startup step. Doing this immediately after step 1
demonstrates the new admission tests have teeth.

**Import sites.** Three, plus one prose mention in `observability/dependency-health.ts:21` and one
in `tests/unit/infrastructure/adapters/cache.test.ts:285`.

**Also touch.** `jest.config.js` — see **Coverage floors** below. This move changes the membership
of both `src/infrastructure/runtime/!(otel-sdk|database|server-lifecycle).ts` and
`src/infrastructure/adapters/!(pdf|mailer).ts`.

**Done.** File and test moved with `git mv`; all five import/prose sites updated (the three real
imports switched from `@infrastructure/runtime/managed-connection` to
`@infrastructure/adapters/managed-connection`, matching the same-directory-alias convention every
other `adapters/*` file already uses rather than a relative `./`). Coverage: `managed-connection.ts`
measures 98.46/92/100/98.46 (statements/branches/functions/lines) against the
`adapters/!(pdf|mailer).ts` floor of 70/70/70/70 — comfortably clears it, so that key's numbers
didn't need to move, only its membership. No jest key needed touching for the `runtime/` side
either: the negated glob simply stopped matching a file that no longer exists there.

### 3. Pull the controller factories out of `http/`

**What.** `controller.ts`, `delete-controller.ts` and `search-controller.ts` leave
`src/infrastructure/http/`. Name to settle on the day — `src/infrastructure/controllers/` reads
naturally but is a mechanism name, which is the trap this whole plan is about; something naming the
job ("the shape every controller repeats") would be better if one can be found that is not
tortured.

**Why.** This is the step that answers the original complaint. These three files are the group that
does not belong: they are the only things under `http/` that know about service result envelopes,
audit actions and not-found keys, and they are still multiplying.

**Import sites.** 61 — `controller` 55, `delete-controller` 3, `search-controller` 3.

**Also touch.**

- `eslint.config.ts:530` hard-codes the string `@infrastructure/http/controller` in the
  `no-restricted-imports` wall that keeps non-controllers out of it. The rule survives the move
  unchanged in spirit; only the path string moves. Its docblock at `:503-522` names the path in
  prose too.
- `jest.config.js` — the three files leave `src/infrastructure/http/**/*.ts` and need a key of
  their own, or the coverage-threshold guard test fails. See below.

**Watch for.** The `http` floor is currently 62/42/50/62 — much lower than the 70 most
infrastructure folders carry. The hypothesis worth checking after this move is that the factories
are what drags it down (they are exercised by the contract and integration suites, not by unit
tests — there is no `tests/unit/infrastructure/http/controller.test.ts`). If so, the `http` floor
can be re-fitted upward in the same commit, which turns this refactor into a real gate improvement
rather than a lateral move.

**Done, with the corrections logged in Status above.** `controller.ts` did not move — see Status.
Only `create-delete-controller.ts`, `create-item-controller.ts`, `create-list-controller.ts` and
`create-search-controller.ts` moved — first to `src/infrastructure/controller-factories/`, renamed
to `src/infrastructure/surfaces/` after review (see Status). None had a dedicated unit test to move
alongside them — their unit coverage is transitive, through the ten controllers built on them; see
**Coverage floors** below. Real import-site count was **10**, not 61 — the plan's 61 was a
`controller`-file estimate from before `controller.ts` was known to be staying; the four factories'
own importers are the ten module controllers built on them, all updated
(`@infrastructure/http/create-*-controller` → `@infrastructure/surfaces/create-*-controller`), plus
one contract-test path string in `tests/contract/request-sources.test.ts:202` that maps
`createDeleteController(` to its defining file on disk.

The `eslint.config.ts:530` edit never happened — that rule guards `@infrastructure/http/controller`,
which stayed put, so the wall needed no change and `npm run check:dependencies` /
`npx eslint src tests` both pass unmodified. The four factory files' own internal imports
(`./response`, `./request`, `./controller`, `./schemas`, `./errors`) switched to the
`@infrastructure/http/*` alias, since they now cross a folder boundary to reach files that stayed
behind.

**The hypothesis was right.** Measured per-file minimum across everything still under
`http/**/*.ts` (13 files, top-level plus `middlewares/`) is 87.43/42.85/50/87.43 — `rate-limit.ts`
is now the low file on statements/lines (87.43), `validation-messages.ts` still the low one on
branches (42.85, already covered by the existing 42), `controller.ts` still the low one on
functions (exactly 50). The floor moved from 62/42/50/62 to **87/42/50/87** — the gate improvement
the plan hoped for, landing in the same change rather than a separate one. The new
`surfaces/*.ts` key is floored at its own measured minimum, 62/100/50/62 — see **Coverage floors**
below for why it gets a floor at all rather than following the per-module-`controllers/`-is-unfloored
convention.

### 4. `http/middlewares/security.ts` → `rate-limit.ts`

**What.** Rename, and fold `rate-limit-store.ts` in beside it — either as a second file under a
clearer shared name or merged, depending on how the 281-line store reads next to the 199-line
limiters.

**Why.** Removes the `security.ts` collision with `app/security.ts` and stops one concern being
split across a file named for a much larger topic. Cheap, and it makes both import lines
self-describing.

**Import sites.** ~16 (`middlewares/security` 11, `middlewares/rate-limit-store` 5), plus the test
files `security.test.ts`, `rate-limit-store.test.ts` and `rate-limit-store-selection.test.ts`.

**Done — renamed, not folded.** `security.ts` → `rate-limit.ts`, `security.test.ts` →
`rate-limit.test.ts`; `rate-limit-store.ts` and its two test files stay separate files, not merged
in. Measured sizes at the time of the move: `rate-limit.ts` 199 lines, `rate-limit-store.ts` 281 —
combined, 480 lines, which would have created a third file past the repo's own ~300-line split rule
(see **Smaller inconsistencies** below, which already flags `request.ts` and `middlewares/cache.ts`
for exactly this). Renaming alone already resolves both things step 4 named — the `app/security.ts`
collision and the "named for a bigger topic than its contents" complaint — without adding a new
size violation to fix them. `isMetricsScraper` rides along in `rate-limit.ts` unmoved: it is not
rate limiting either (it's the Prometheus-scrape credential check), which the plan's own **Smaller
inconsistencies** note called out but step 4 never scoped a destination for — left as a residual,
same as this plan leaves the `metrics-cache.ts`/`metrics-http.ts`/`persistence/metrics.ts` split
below. 11 real import sites plus 3 prose mentions (in `tests/support/setup.ts`,
`docs/theory/modules.md`, `docs/tools/load-testing.md`) updated; `docs/reference/src-infrastructure.md`
and `docs/reference/tests.md` rows renamed to match.

### 5. Split the wire dialect out of `http/` — DEFERRED

**What.** `response.ts`, `errors.ts`, `schemas.ts` and `validation-messages.ts` move to a folder of
their own.

**Why deferred.** ~160 import sites (`response` 114 — the most-imported file in the whole
substrate — `errors` 22, `schemas` 21, `validation-messages` 3). After step 3, `http` is already
coherent, so this buys a naming nuance at a large churn cost. Revisit only if the folder starts
accreting again.

**If it is ever done:** both obvious names are taken in this repo. `contract/` collides with the
OpenAPI contract fragments (`docs/api/contract-fragmentation.md`, `contracts:bundle`), and `api/`
collides with the `@api/*` alias pointing at the generated orval client — `@infrastructure/api/response`
sitting next to `@api/schemas.zod` would be actively confusing. `wire/` is free.

### Non-goal: leave `adapters/*.worker.ts` alone

`email.worker.ts` and `pdf.worker.ts` look like mechanism-naming inside a job-named folder, and the
instinct is to collect them. Do not. `layers.md:209` argues the placement deliberately — the worker
is the consumer half of its adapter, and gathering them re-creates the `src/workers/` directory
that was dissolved on purpose.

---

## Execution gotchas

These apply to every step that moves a file, and each has bitten this repo before.

### Coverage floors — the sharpest one

`jest.config.js` keys `coverageThreshold` by path glob, and its own header (`:140-160`) records
that a key matching no file is **silently ignored**: the run stays green while reading like a gate.
`tests/cross-cutting/coverage-thresholds.test.ts` exists because three keys detached at once that
way and 203 of 275 source files sat unfloored.

That test performs the reporter's own glob expansion and fails any key that comes back empty — so
it catches a key left behind, but **not** a directory that gained files and now needs its own key.
Both halves are manual:

| Step | Keys affected                                                                                             | Landed as                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2    | `runtime/!(otel-sdk\|database\|server-lifecycle).ts` loses a file; `adapters/!(pdf\|mailer).ts` gains one | neither key's numbers moved — `managed-connection.ts` clears 70/70/70/70 at 98.46/92/100/98.46 |
| 3    | `src/infrastructure/http/**/*.ts` loses four files (not three — see Status); the new folder needs a key   | `http/**/*.ts` raised 62/42/50/62 → **87/42/50/87**; new key `surfaces/*.ts` at 62/100/50/62   |
| 4    | no key change — both files stay under `http/**`                                                           | confirmed — no key touched                                                                     |

Remember the extglob rule the config header states: Jest adds a file to **every** matching group
rather than the most specific one, so an exemption must be negated out of the broad glob, never
just given a second lower key.

Measure before writing a number: `npm run test -- --coverage` and read the per-path table. **Done as
`npm run test:unit:coverage -- --coverageReporters=text`** (the actual npm script; `npm run test --
--coverage` above was shorthand) — run twice, because the first run overlapped with the `git mv`
calls still in flight and reported spurious `ENOENT`s on the path mid-move. The second, clean run is
what the numbers above come from.

**Why `surfaces/*.ts` gets a floor at all.** The existing policy note above this block
says per-module `controllers/` files are deliberately unfloored because they read ~0% on the unit
run — real coverage lives in `tests/contract/`/`tests/integration/`. The four factories don't fit
that: they measured 62.09–82.71% on the unit run with no dedicated unit-test file of their own,
because the ten controllers built on them exercise their bodies transitively. Leaving them unfloored
would have been following the letter of an existing rule past the reason for it.

### Everything else

- **ESLint.** `eslint.config.ts:615` anchors the tier walls on `src/infrastructure` as a whole, so
  no move _within_ infrastructure disturbs them. Only the literal path at `:530` needs editing. —
  **Confirmed, and turned out to need zero edits**: `:530` guards `@infrastructure/http/controller`,
  which never moved (see Status). `npx eslint src tests --max-warnings=0` and
  `npm run check:dependencies` both pass unmodified against the moved tree.
- **Tests mirror the source tree.** `tests/unit/infrastructure/<folder>/` follows every move. —
  **Done for the two that had tests to move**: `tests/unit/infrastructure/adapters/managed-connection.test.ts`
  and `tests/unit/infrastructure/http/middlewares/rate-limit.test.ts`. The four `surfaces/` files had
  no dedicated unit test before or after the move — nothing to mirror.
- **Docs.** 76 mentions of `infrastructure/http` across 35 files under `docs/`. `npm run docs:build`
  catches broken relative links but **not** inline backticked paths — those need a grep sweep. The
  `<!-- doc-paths:ignore -->` markers in `layers.md` mark rows that intentionally name paths that no
  longer exist; do not "fix" those. — **Narrower in practice than the estimate**: the 76 mentions are
  almost all still-valid references to `response.ts`/`request.ts`/`errors.ts`/etc., which stayed put
  (step 5 is deferred). The actual sweep was for the files that DID move — `managed-connection`,
  `create-*-controller`, `middlewares/security` — 9 files across `docs/tools/redis-cache.md`,
  `docs/theory/modules.md`, `docs/tools/load-testing.md`, `docs/reference/src-infrastructure.md`,
  `docs/reference/tests.md`, plus the two source-tree prose mentions named in step 2. `npm run
docs:build` passes clean afterward. No `doc-paths:ignore` row was touched.
- **Generated context.** `.2repo/wiki/` and `.2repo/arch/` name source paths throughout and are
  regenerated, not edited: `2repo wiki .` and `2repo arch .` after the moves land. — **Not run**:
  neither `npm run regenerate` nor `npm run complete` invokes `2repo`, so it is not part of the gate
  either command verifies, and running it against an uncommitted, still-under-review tree would be
  regenerating from a state that may not be final. Left for after this plan's changes are committed.
- **The gate.** `npm run complete` is the whole thing (ts-check, lint, spectral, prettier, the
  contract and seed checks, docs build, tests). The pre-commit hook already runs it, so let the hook
  be the verification rather than running both. — **Run directly instead**, once, since nothing here
  is being committed yet and there is no hook to defer to: first pass caught four Prettier-unformatted
  files (three docs tables, one import block in `create-delete-controller.ts` — `npx prettier
--write` fixed all four); second pass was clean. See Status for the full result.
