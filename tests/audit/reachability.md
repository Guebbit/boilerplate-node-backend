---
description: Audit whether a defence its tests prove in isolation is reachable, and identical, through the real mounted request path
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(ls:*), Bash(2brain query:*)
---

ROLE: Integration auditor. You trust no test's verdict. A test tells you its own
entry point behaved; it tells you nothing about the entry point a client uses.

GOAL: Find defences that are CORRECT where they are tested and dead, unreachable
or different through the real mounted path.

**Every case this audit looks for has passing tests.** That is the premise, not an
edge case — a green suite is the symptom, not the refutation. Do not treat "there
is a test for that" as an answer to anything here.

SCOPE: $1 — a module name (`account`), a path, or `--diff` for modules touched by
the working tree. If empty, use `git status --porcelain` to pick the scope.

## Naming the scope

Output is `tmp/reports/audit/reachability/<SCOPE>.md`, where `<SCOPE>` is:

- a module → the module name (`account`)
- a path → the path slugged, `src/` dropped (`src/kernel/middlewares` →
  `kernel-middlewares`)
- `--diff` → the current branch name slugged (`git branch --show-current`)

## What this is NOT

- **Not `spec-gaps`.** That one hunts rules with ZERO coverage. Every finding here
  HAS coverage, and it passes.
- **Not `spec-drift`.** That one hunts a test that agrees with the code but not the
  spec. Here the test agrees with the code AND the spec — the wiring disagrees with
  both.

If a rule has no test at all, it is not this audit's finding. Say so in one line
and move on.

## Steps

### 1 — enumerate the defences

From `docs/theory/defences/*.md`, `docs/tools/security.md`, the module's own docs
page, and every guard, middleware and error handler in scope. One testable
sentence each: what does this refuse, and what happens when it fires?

Include the error paths. "Answers 413 rather than 500" is a defence — of the
alerting, if nothing else.

### 2 — record each defence's test ALTITUDE

Find the test that proves it and write down what it actually calls:

| altitude | looks like                                  |
| -------- | ------------------------------------------- |
| real     | `api()` / supertest against the mounted app |
| router   | the module's real router mounted directly   |
| service  | `accountService.x(...)`                     |
| unit     | the function itself, or its repository      |

Altitude is the whole measurement. Record it even when it is `real` — those rows
are what makes the report readable rather than a list of accusations.

### 3 — trace the real path, for anything below `real`

From the route inward. List every step that runs BEFORE the defence: router-level
`use`, per-route guards in order, body parsers, the error handler that would catch
a throw. `tests/support/routes.ts`'s `guardsOn` gives the guard chain; read
`routes.ts` for the rest.

Then ask the only question that matters: **does any step before it change what the
defence reads, or stop it running at all?**

### 4 — the four tells

Each has bitten this repo. Each passed its tests throughout.

- **A pre-flight step touching the state the defence inspects.** A housekeeping
  sweep ran ahead of refresh-token rotation on the same request, reading the same
  cutoff constant, and deleted the superseded row the reuse check was about to
  recognise — collection-wide, so any user's request would do it. Reuse detection
  could never fire; the service-level test proving it revokes every session passed
  the entire time (`5d860fbd`).
- **An earlier guard rejecting what a later guard was written to handle.**
  `requirePermission` handled api-key callers correctly and documented the case as
  "unreachable through the current routes". It was — `isAuth`, mounted first,
  refused every one of them. The resolver's tests called it directly (`9150604d`).
- **The framework handing the real path a different value than the test does.**
  Express 5 leaves `request.body` UNDEFINED when no parser matched; every
  controller test passes an object. Six unguarded destructures, six 500s, no
  failing test (`c40e79f3`).
- **An error path that leaves the defence's own frame.** A CORS callback refused an
  origin with `callback(new Error(...))`, which `cors` throws into express's error
  chain — a generic 500 before the route ran, rather than a response without the
  header (`8710899c`).

### 5 — classify

`reachable` / `reachable, behaviour differs` / `UNREACHABLE` / `not traced`.

For anything but `reachable`, give the ONE request that proves it — method, path,
headers, body, and any pre-flight call the real path makes that the test omits.
It is usually one line: the reuse case needed nothing but `runTokenCleanup()`
before the replay.

## Output

Write `tmp/reports/audit/reachability/<SCOPE>.md`:

| defence | doc/spec (file:line) | test + altitude | blocked by (file:line) | verdict | proving request |

Then print the `UNREACHABLE` and `behaviour differs` rows, most-exploitable first.

Rules:

- Do NOT write or modify tests or source. This is a report.
- Every verdict cites the real path by `file:line`. "Probably fine" is not a
  verdict — use `not traced` and say what you would have to read.
- A defence whose test already drives `api()` or the real router is `reachable`.
  Record it and move on; low altitude is the finding, not the defence's existence.
- Never report a defence as unreachable on chain order alone. Read what the earlier
  step DOES. A guard running first is normal; a guard running first and refusing
  the input the later one exists for is the finding.
- A deliberate gap is recorded as deliberate, with the doc or comment that says so.
  Two mounts in this repo refuse api-key callers on purpose and say why at the
  mount — that is a row, not a finding.
- `tmp/reports/` is gitignored. These files are working evidence, not deliverables.
