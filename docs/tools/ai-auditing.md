# AI Auditing

Every other instrument in this repo compares the system **to itself**: code to schema, mutant to
suite, response to contract. That is what makes them deterministic, and it is also their ceiling.
Stryker cannot read `docs/theory/domain-layer.md`. Schemathesis cannot read a ticket. CodeQL cannot
notice that the docs promise a rule the contract never encodes.

**Prose ↔ code is the gap**, and it is the one place a language model beats a program rather than
approximating one. This repo has ~56 files under `docs/` stating rules no schema enforces.

`tests/audit/` holds three prompts that live in exactly that gap. They are plain markdown, run by
hand against an LLM, and they write reports — never code.

## The one rule

> The model proposes. A deterministic oracle disposes.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 50}}}%%
flowchart LR
    A["LLM proposes<br/>a hypothesis"] --> B{"Deterministic<br/>gate"}
    B -->|survives| C["Finding<br/>with a citation"]
    B -->|dies| D["Discarded<br/>silently"]
    C --> E["Human reads it,<br/>decides, writes a test"]

    classDef ai fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef gate fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef out fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef dead fill:#fee2e2,stroke:#dc2626,color:#111827;
    class A ai;
    class B gate;
    class C,E out;
    class D dead;
```

Two consequences, both non-negotiable:

- **Nothing AI-generated gates CI.** A red build must be reproducible by re-running it. An LLM
  verdict is not, so these report and never block.
- **A finding without a citation is not a finding.** Either a `file:line` in the spec, or nothing.
  Prose confidence is not evidence.

## The three prompts

| File                         | Asks                                                                          | Writes to                    |
| ---------------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| `tests/audit/spec-drift.md`  | Which tests assert what the **code** does rather than what the **spec** says? | `reports/audit/spec-drift/`  |
| `tests/audit/spec-gaps.md`   | Which business rules and security boundaries have **zero** coverage?          | `reports/audit/spec-gaps/`   |
| `tests/audit/suite-bloat.md` | Which tests cost CI time and discriminate nothing?                            | `reports/audit/suite-bloat/` |

All three take one argument — a module (`orders`), a path, or `--diff` for whatever the working
tree touched.

The three prompt files are the only part of this kept byte-identical with the sibling repo
(`boilerplate-vue-frontend`) — they are repo-agnostic by design, so a change worth making to one is
worth copying to the other. Nothing enforces it: they are not in `SHARED_FILES`, whose rule is that
a shared file must be owned by one side, and these are co-authored. Copy by hand, and check with
`diff` when in doubt.

This page is the opposite: deliberately per-repo. It names this repo's own tools, its own `docs/`
count and its own findings, so the two copies are _expected_ to differ and must not be reconciled.

### Naming the scope

The argument decides the filename, one way only:

| Argument | `<SCOPE>`                                       |
| -------- | ----------------------------------------------- |
| a module | the module name — `orders`                      |
| a path   | slugged, `src/` dropped — `infrastructure-http` |
| `--diff` | the current branch name, slugged                |

`orders.findings.md` tells the next reader what it covers. A batch number does not — never invent
one.

### The reports are disposable

`reports/` is gitignored, and that is the intended end state, not an oversight. A report is working
evidence: once its conclusions land as a fixed test, a commit message or a tracked issue, the file
has done its job. Audit paperwork that outlives the audit goes stale silently and misleads the next
reader — the prompts are the durable asset here, not their output.

## The two-pass method

`spec-drift.md` is the one worth understanding, because its **ordering is the method**. Spec
drift is a test and an implementation sharing one wrong reading of the spec — CI is
green, and the test proves only that the test agrees with the code.

You cannot find that by reading the test, because the test looks correct. You find it by deriving
what the behaviour _should_ be **before** the implementation can contaminate you.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 50}}}%%
flowchart TD
    S["Pass 1 — spec only<br/><i>openapi.yaml, asyncapi.yaml, docs/</i>"] --> F["Freeze expectations<br/>to a file, one row per behaviour"]
    F --> G["<b>Save it. Do not revise it.</b><br/>This is the control."]
    G --> I["Pass 2 — open the code<br/>and the tests"]
    I --> C{"spec says X<br/>code does Y<br/>test asserts Y"}
    C -->|yes| M["MISMATCH —<br/>spec drift"]
    C -->|no| O["OK, or spec-silent"]

    classDef pass fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef ctrl fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef bad fill:#fee2e2,stroke:#dc2626,color:#111827;
    classDef ok fill:#dcfce7,stroke:#16a34a,color:#111827;
    class S,I pass;
    class F,G ctrl;
    class M bad;
    class O,C ok;
```

Writing the expectations down before opening `src/` is not ceremony — it is the only thing keeping
the control uncontaminated. Skip it and the audit degrades into a code review that agrees with
whatever it just read.

The freeze is procedural, not cryptographic: the file is gitignored, so nothing stops you editing it
after the fact. Nothing except the fact that doing so destroys the only reason the second pass is
worth running. If a pass-1 row turns out to be wrong, add a pass-2 row saying so — do not quietly
rewrite the control to match what you just learned.

## How to run one

The prompts are written in Claude Code's slash-command format, so the cheapest way to use them is to
let it find them:

```bash
mkdir -p .claude/commands
ln -s ../../tests/audit .claude/commands/audit
```

That gives `/audit:spec-drift orders`, `/audit:spec-gaps inventory`, `/audit:suite-bloat --diff`.
The symlink is local, gitignored and regenerable — the files under `tests/audit/` remain the only
copy.

Without the symlink, either works:

- **Claude Code** — _"Follow `tests/audit/spec-drift.md`, scope `orders`."_
- **Any other LLM** — strip the YAML frontmatter, replace `$1` with the scope, paste the body. It
  needs to be able to read the repo; an audit that cannot open `openapi.yaml` has nothing to
  compare against.

The frontmatter is not decoration. `allowed-tools` is the read-only boundary — `Read`, `Glob`,
`Grep`, `Write` and a few `Bash` verbs, with no `Edit`. These commands report; they never touch
source.

::: tip Which model
Claude for `spec-drift` and `spec-gaps` — long-context reasoning over prose vs. code is exactly
where small local models confabulate citations most confidently, and a fabricated `file:line` costs
more than the finding was worth.

`suite-bloat` is the exception. It is bookkeeping over `reports/mutation/mutation.json`, and a local
Ollama model handles it.
:::

## Reading the output

A findings table uses four verdicts, and only one of them is a bug:

| Verdict           | Means                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- |
| **MISMATCH-CODE** | Spec says X, code does Y, the test asserts Y. The thing this audit exists to find. |
| **TAUTOLOGY**     | The assertion cannot fail — the expected value is produced by the code under test. |
| **SPEC-SILENT**   | A sensible assertion no document actually requires. Worth knowing, not a defect.   |
| **OK**            | Test and spec agree.                                                               |

`TAUTOLOGY` is the quiet one. `expect(f(x)).toEqual(g(x))` where `g` is a sibling export, or a
`Record<Enum, …>` whose totality TypeScript already enforces, is a test that cannot fail and
therefore proves nothing. Stryker finds some of these; the audit finds the rest.

## Does it work?

The first batch ran over six scopes — order lifecycle and money, inventory reservations, cart and
checkout, payments, account and auth, and the per-operation `security:` blocks. Expectations were
frozen and committed first, one commit per scope.

It produced fixes, not a report nobody read: an order accepting a same-value `paid` write that
should have 409'd, a shipping-absence case, account endpoints answering the wrong status, an
admin-delete audit action that conflated hard and soft deletes, and a duplicated union-registration
check. One of its own rollups was wrong and got corrected too, which is the honest version of this
story.

Run them before a refactor, after a contract change, or when a module's docs and tests have drifted
apart — not on a schedule.

---

## Footnote: the tools we evaluated, and why none were adopted

Checked **2026-09-03**. Treat that as an expiry date, not a warranty — the whole reason this
footnote exists is that the previous round of claims had quietly gone stale.

| Tool                                 | State                                | Why not                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mutahunter** (LLM mutants)         | Dead — last release 2025-04-17       | Also removed its coverage-driven mode in 1.3.2, the one feature that made it fit here.                                                                                         |
| **LLMorpheus** (LLM mutants, JS)     | Archived 2025-02-03                  | The only JS-native equivalent, and it stopped.                                                                                                                                 |
| **Qodo Cover / Cover-Agent**         | Unmaintained notice since 2025-06-15 | Gates generated tests on coverage and pass/fail, never the spec — so every test it keeps agrees with the code by construction. That is the defect `spec-drift` exists to find. |
| **CodeRabbit / PR-Agent / Greptile** | Alive and healthy                    | Duplicate review surface. `/code-review` and `/security-review` already cover the diff, and there is no PR workflow here for a bot to attach to.                               |
| **promptfoo**                        | Alive, MIT, weekly releases          | ~600 MB and 524 packages for a YAML runner — 513 MB of it a local ONNX inference runtime we would never call.                                                                  |

Two notes worth keeping, because they outlived the tools:

- **The reason for rejecting the review bots changed.** It used to be "a hosted bot cannot read
  `CLAUDE.md`". That is no longer true — CodeRabbit reads that exact filename by default now. They
  are rejected on redundancy and cost, which is a different argument, and the old one should not be
  repeated.
- **Nothing in this niche is alive.** StrykerJS has not added LLM-authored mutants either.
  Meta run the idea in production internally, but it is not a product. If that changes, the
  prompt files here are the thing that would be replaced.

## Related

- [Mutation Testing](./mutation-testing.md) — the deterministic instrument this one complements
- [Coverage & Confidence](./coverage-and-confidence.md) — what a score does and does not mean
- [Testing & Docs](./testing-and-docs.md) — every layer, and which question each answers
