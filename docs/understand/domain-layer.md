---
type: concept
audience: [developer, architect]
---

# Domain layer & DDD

Two things, in order:

1. **`domain/`** — the folder, the rule, and where a piece of logic goes.
2. **DDD** — what it actually is, and why it is _not_ the same as this architecture.

---

## 1. The folder

> **A business rule is anything you could test without a database.**
> It goes in `src/modules/<name>/domain/`, as a function that takes data and returns a verdict.

### Where does this go?

### The rule, enforced by lint

### The shape: verdict, not rejection

### Why bother

`src/modules/orders/tests/unit/totals.property.test.ts` runs **each property over `TEST_PROPERTY_RUNS` generated baskets (300 by default), seeded, with no
`setupTestDb`, no `beforeAll` and no mocks** — there is nothing to set up, because the file under
test cannot reach anything. It proves things like _"a total is never `NaN`, for every possible
input"_, which is a claim about all inputs that no table of examples can make. A `NaN` total

### Is this standard?

Yes. A framework-free innermost layer is one of the most agreed-on ideas in software architecture —
four traditions describe the same ring under four names.

### The floor: "testable without a database" is necessary, not sufficient

The question above decides _where_ a rule goes. It does not decide _whether_ there is a rule. A
one-line expression passes "testable without a database" trivially, so the test alone would pull
every ternary in the codebase into `domain/`.

### A 3+-state stored status almost always earns the folder

A 3+-state **stored** status almost always clears the floor, because its allowed moves are a rule: a
transition table catches real bugs a status literal scattered across services cannot.

Full detail: [1. The folder](./domain-layer-folder.md).

## 2. What DDD is

**Domain-Driven Design** (Eric Evans, 2003) is a way of _modelling a business in code_. It has two
halves, and almost everyone means the second when they say "DDD".

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 40}}}%%
flowchart TD
    DDD["DDD"]
    DDD --> ST["<b>Strategic</b><br/>how you carve the system up"]
    DDD --> TA["<b>Tactical</b><br/>how you model inside one piece"]

    ST --> S1["bounded contexts"]
    ST --> S2["ubiquitous language"]
    ST --> S3["context mapping"]
    ST --> S4["core vs generic subdomains"]

    TA --> T1["entities"]
    TA --> T2["value objects"]
    TA --> T3["aggregates"]
    TA --> T4["domain repositories"]

    classDef have fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef lack fill:#fee2e2,stroke:#dc2626,color:#111827;
    classDef neutral fill:#dbeafe,stroke:#2563eb,color:#111827;
    class ST,S1,S2,S3,S4 have;
    class TA,T1,T2,T3,T4 lack;
    class DDD neutral;
```

**Green = this repo has it. Red = it does not.**

---

## 3. DDD vs feature/domain architecture

These are not the same thing, and conflating them is the usual reason "we do DDD" means "we have
folders named after features".

**Feature architecture is a _packaging_ decision.** Where do files live?

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 25, 'rankSpacing': 35}}}%%
flowchart LR
    subgraph BY_LAYER["❌ package by layer"]
        direction TB
        L1["controllers/<br/>products · orders · cart"]
        L2["services/<br/>products · orders · cart"]
        L3["models/<br/>products · orders · cart"]
    end

    subgraph BY_FEATURE["✅ package by feature"]
        direction TB
        F1["products/<br/>controller · service · model"]
        F2["orders/<br/>controller · service · model"]
        F3["cart/<br/>controller · service · model"]
    end

    classDef bad fill:#fee2e2,stroke:#dc2626,color:#111827;
    classDef good fill:#dcfce7,stroke:#16a34a,color:#111827;
    class L1,L2,L3 bad;
    class F1,F2,F3 good;
```

Deleting a feature becomes one folder instead of three edits. **This repo does this, and it is
done.**

**DDD is a _modelling_ decision.** What do the files contain?

|             | Feature architecture           | DDD (tactical)                |
| ----------- | ------------------------------ | ----------------------------- |
| Answers     | _where does this file live?_   | _how is this rule expressed?_ |
| Unit        | a folder                       | an aggregate                  |
| Deliverable | a directory tree               | a model of the business       |
| Alone?      | yes — and this repo largely is | yes, in any tree shape        |

**You can have immaculate feature folders and zero DDD.** That is roughly this repo's position, and
it is a good one — the usual failure is the reverse: elaborate tactical patterns inside a ball of mud.

The overlap is real but partial: a **bounded context** and a **feature folder** often end up being
the same directory, which is why people conflate them. But a bounded context is defined by _where
one model and one language stop being valid_, not by where you put files.

---

## 4. Where this repo stands

**Strategic DDD — adopted, and mostly machine-checked.** Most rows are a declaration in the code with a
check behind it, not a claim about intent. Three have none: the kind label of each context-map edge,
the ubiquitous language and the subdomain table are prose, with no test behind them. See [Strategic DDD](./strategic-ddd.md) for what each one
enforces and what it refuses.

| Concept                | Where                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Bounded context        | one folder per module; `rm -rf` deletes the domain                                                                              |
| Published language     | the module barrel, `index.ts` — lint forbids reaching past it, every module publishes one                                       |
| Context map            | the edges in `module.yaml#dependsOn` (enforced by `npm run check`); each edge's kind and why, in prose on the module pages      |
| Ubiquitous language    | the code's own identifiers, per context — see [Glossary](../reference/glossary.md)                                              |
| Subdomain distillation | the table in [Strategic DDD](./strategic-ddd.md) §4 — a judgement, re-decided per project                                       |
| Domain events          | `kernel/events.ts` — `products` emits, `cart` subscribes                                                                        |
| Domain service         | `orders/domain/totals.ts`, `orders/domain/lifecycle.ts`, `returns/domain/refund-amount.ts`, `invoicing/domain/credit-shares.ts` |

**Tactical DDD — absent, deliberately:**

| Concept                             | Today                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Entity                              | none — a Mongoose document is the model                                 |
| Value object                        | `Money` only — `domain-primitives/money.ts`, internal to the arithmetic |
| Aggregate root                      | implicit only                                                           |
| Repository returning domain objects | no — returns `OrderDocument`                                            |
| Invariants at construction          | no — Mongoose schema validators, plus the lifecycle table on the writes |

One tell: the `__v` conditional write in `cart/services/checkout.ts` is **aggregate versioning**,
hand-rolled because there is no aggregate to hang it on. The need is real; only the vocabulary is
missing.

`Money` and the lifecycle table are the two cheap tactical patterns that pay for themselves without an
aggregate — plain data with functions in front of it, placed wherever the rule lives. See
[Tactical DDD](./tactical-ddd.md) for why those two and nothing else.

---

## 5. Should you go further?

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 40}}}%%
flowchart TD
    Q{"Does the business<br/>argue about these rules?"}
    Q -->|"no — CRUD over a form"| A["rules file in domain/<br/>✅ what this repo ships"]
    Q -->|yes| Q2{"Does the logic outgrow<br/>plain functions?"}
    Q2 -->|no| A
    Q2 -->|yes| B["full tactical DDD<br/>in that module only"]

    classDef ask fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef cheap fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef costly fill:#fef3c7,stroke:#d97706,color:#111827;
    class Q,Q2 ask;
    class A cheap;
    class B costly;
```

DDD's own doctrine: spend the modelling effort on the **core domain**. The effort follows the logic,
and the subdomain label is the first guess at how much logic there will be
([strategic §4](./strategic-ddd.md#_4-subdomain-distillation-—-where-to-spend-effort)). A boilerplate
cannot know where a real project's logic will grow, so it ships the cheap option and leaves the
expensive one one folder away.

The expensive option is an aggregate root, a repository returning domain objects instead of
`OrderDocument`, and invariants enforced at construction rather than by a Mongoose schema
validator — worth the redesign only once a real core domain argues, by hand, about rules the
`domain/` folder's plain functions can no longer keep straight.

## Read next

- [Layers](./layers.md) — the folder map
- [Modules](./modules.md) — the tier rules and their naming
