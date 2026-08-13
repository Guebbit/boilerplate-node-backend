# Modules

A domain lives in exactly one folder. Adding one is a folder plus a line; removing one is `rm -rf`
plus deleting that line. Everything on this page exists to make those two sentences true.

> New to the words **domain** and **barrel**? They are defined with a picture each in
> [The words these pages use](./index.md#the-words-these-pages-use).

## The four tiers

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 60}}}%%
flowchart TD
    A["<b>src/app</b><br/>this application: assembly<br/><i>bootstrap · system route</i>"]
    M["<b>src/modules/*</b><br/>one domain each, top to bottom<br/><i>products · orders · account · …</i>"]
    P["<b>src/kernel</b><br/>the module system itself<br/><i>registry · events · auth port · guard</i>"]
    C["<b>src/infrastructure</b><br/>substrate — never knows modules exist<br/><i>adapters · http · persistence · i18n · runtime</i>"]

    A ==> M
    M ==> P
    P ==> C
    A -.-> P
    A -.-> C
    M -.-> C

    classDef app fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef domain fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef plat fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef core fill:#ddd6fe,stroke:#7c3aed,color:#111827;
    class A app;
    class M domain;
    class P plat;
    class C core;
```

**Every arrow points down, and none points back.** That is the whole architecture. A tier may import
anything below it and nothing above it, and lint enforces each edge in both directions.

| Tier               | Folder               | Knows about                                | May import             |
| ------------------ | -------------------- | ------------------------------------------ | ---------------------- |
| **App**            | `src/app`            | this application: how it is assembled      | modules, kernel, infra |
| **Modules**        | `src/modules/<name>` | its own domain, plus siblings' **barrels** | kernel, infra          |
| **Kernel**         | `src/kernel`         | that modules exist — never _which_ ones    | infra                  |
| **Infrastructure** | `src/infrastructure` | Express, Mongoose, the outside world       | —                      |

### The `infrastructure` / `kernel` line

This is the boundary people trip on, so it gets one question and no adjectives:

> **If this project had no modules at all — if it were one undivided app — would this file still
> make sense?**

- **Yes, it still works** → `infrastructure`.
- **No, it becomes meaningless** → `kernel`.

`infrastructure` is not "framework-free" — it is the opposite. Seven files there import Express and
six import Mongoose, which is exactly right: `infrastructure/http/response.ts` is Express-coupled
substrate and belongs where it is. The one thing it may never contain is the knowledge that a
module system exists.

It also may not hold a **business rule**, even one that two modules share. That is the trap this
tier invites, because "two modules need it" feels like a reason to push something down. It is not:
the substrate is what the application runs ON, and none of it knows what an order or a price is. A
shared rule belongs to whichever domain OWNS it, exported through that module's barrel — see
`modules/orders/totals.ts`, which sat here until the rename made the leak obvious.

So `kernel` is small on purpose. It is the module system, and nothing else:

| File                            | Why it cannot be infrastructure                                            |
| ------------------------------- | -------------------------------------------------------------------------- |
| `registry.ts`                   | it _is_ the module system — `IAppModule`, the DAG check, `registerModules` |
| `events.ts`                     | it exists so two modules can talk without importing each other             |
| `authentication.ts`             | the socket `account` plugs into, so guards need no module import           |
| `middlewares/authorizations.ts` | the guard that consumes that socket                                        |

Delete `src/modules/` and those four files lose their reason to exist. Everything else that is
domain-free is `infrastructure`, no matter where it sits in the request lifecycle:

| Feature                        | Home                                                | Why it is not kernel                          |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------- |
| response cache, `noStore`      | `infrastructure/http/middlewares/cache.ts`          | Express caching; no module needed             |
| locale negotiation             | `infrastructure/http/middlewares/locale.ts`         | wraps `infrastructure/i18n`; no module needed |
| observability context          | `infrastructure/http/middlewares/observability.ts`  | seeds a request context                       |
| access logging                 | `infrastructure/http/middlewares/request-logger.ts` | reads tracer + metrics labels                 |
| rate limiting, metrics scraper | `infrastructure/http/middlewares/security.ts`       | generic HTTP hardening                        |
| conditional handler toggle     | `infrastructure/http/middlewares/route-flag.ts`     | imports nothing but Express                   |
| email queue consumer           | `infrastructure/adapters/email.worker.ts`           | the consumer half of `adapters/mailer.ts`     |
| PDF queue consumer             | `infrastructure/adapters/pdf.worker.ts`             | the consumer half of `adapters/pdf.ts`        |
| worker registration at boot    | `app/workers.ts`                                    | names which queues _this_ build drains        |

The test that keeps this honest: a `kernel` file may be imported by a module, but its **purpose**
must dissolve if modules do. Being domain-free is not enough — most of `infrastructure` is
domain-free too.

Both tables describe the tree as it is. `src/kernel/` holds four files.

### Why these names, and what everyone else calls them

Separating a module system from its substrate is a well-established pattern. The **vocabulary is
not**, and that is the whole reason this section exists:

| Project       | The module / DI system | The substrate     |
| ------------- | ---------------------- | ----------------- |
| **VS Code**   | `vs/platform`          | `vs/base`         |
| **NestJS**    | `@nestjs/core`         | `@nestjs/common`  |
| **Angular**   | `@angular/core`        | `@angular/common` |
| **Spring**    | `spring-context`       | `spring-core`     |
| **Backstage** | `core-plugin-api`      | `core-components` |
| **this repo** | `kernel`               | `infrastructure`  |

Read the table for what it actually shows: **`core` names both halves, depending on who you ask.**
Nest and Angular use it for the DI container, Spring and Backstage for the substrate. This repo
used it for the substrate, and the section above had to open with a standing disclaimer saying so
— insisting, every time, that `core` did not mean what most readers assume.

That is the argument in one line. A name needing a disclaimer does negative work: a NOVEL name
makes a reader look it up, an OVERLOADED one makes them think they already know. The second failure
is silent, and it is the expensive one.

`infrastructure` needs no disclaimer. Adapters, HTTP plumbing, persistence substrate and runtime
are what the word means in hexagonal architecture — the tradition this dependency rule already
comes from. `common` and `base` were the other candidates and were rejected for the opposite
reason: they describe nothing, and a folder that describes nothing accepts anything, which is
exactly how the old `src/utils/` became a dumping ground.

**`platform` → `kernel` is the less obvious half, so here is the case against it first.** VS Code
is a real precedent, and an earlier version of this page leaned on it to keep the name. Two things
outweighed it. First, `vs/platform` is VS Code's _service and DI layer_ — a third meaning again, so
the precedent supports "platform ≈ services", not "platform ≈ plugin host". Second, the word now
belongs to platform engineering, where "the platform" is the base layer everything runs on. That is
this repo's `infrastructure`. Read cold, the two old names pointed at each other's contents.

`kernel` carries none of that. These four files are a **microkernel**: a small fixed host that
loads, validates and connects plugins it has never heard of — the pattern under its textbook name.
The folder says what it is, and so does the tier beneath it.

These names are deliberately kept. The confusion this section exists to prevent was never caused by
the words — it was caused by a criterion that did not match the code, and by files sitting in the
wrong tier. Both are fixed above, and a rename would be motion rather than progress.

### Why "app" is a tier and not a leftovers drawer

It holds the things that are allowed to know every domain: `bootstrap` (the `install(app)` steps),
and the system route that belongs to no domain. `src/modules.ts` and `app.ts` sit beside it for the
same reason — the registry names every enabled domain, which nothing below it may do.

The test for whether something belongs here: **does it need to know which domains exist?** If yes,
it is `app`. If it needs a domain's _capability_ but not its identity, it is `kernel` with a port.

### The rule that forced the shape

`authorizations.ts` guards every module's routes and needs a user to do it. That is a genuine
tension, and the naive placements both fail:

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 35, 'rankSpacing': 40}}}%%
flowchart LR
    subgraph BAD1["❌ in a module"]
        u1[users] --> a1[account]
        a1 --> u1
    end
    subgraph BAD2["❌ in app"]
        m2[modules] --> app2[app]
        app2 --> m2
    end
    subgraph OK["✅ in kernel, behind a port"]
        m3[modules] --> p3[kernel]
        acct3[account] -.->|registers resolver| p3
    end
    classDef bad fill:#fee2e2,stroke:#dc2626,color:#111827;
    classDef good fill:#dcfce7,stroke:#16a34a,color:#111827;
    class u1,a1,m2,app2 bad;
    class m3,p3,acct3 good;
```

In `account` it closes a `users → account → users` cycle, because `users`' own admin routes need
`isAdmin`. In `app` it makes modules import upward. So `kernel` declares what it needs —
"turn this token into a user" — and `account` registers an implementation at boot. Same inversion as
`IAuditSink` and `IImageStore`. See `src/kernel/authentication.ts`.

### Where everything else sits

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 45}}}%%
flowchart TD
    ENTRY["app.ts · cluster.ts<br/><i>process entry</i>"]
    REG["modules.ts<br/><i>THE enabled-domain list</i>"]
    APP["app/<br/><i>bootstrap · system-routes</i>"]
    MODS["modules/*"]
    PLAT["kernel/<br/><i>registry · events<br/>auth port · guard</i>"]
    CORE["infrastructure/<br/><i>adapters · http · persistence<br/>i18n · runtime</i>"]

    ENTRY --> REG --> MODS
    ENTRY --> APP --> MODS
    MODS --> PLAT --> CORE

    classDef app fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef domain fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef plat fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef infrastructure fill:#ddd6fe,stroke:#7c3aed,color:#111827;
    class ENTRY,REG,APP app;
    class MODS domain;
    class PLAT plat;
    class CORE infrastructure;
```

**One alias per tier**, so an import line states which tier it crosses: `@app/*`, `@modules/*`,
`@kernel/*`, `@infrastructure/*`.

Two naming details worth knowing, because both were confusing before:

- **`infrastructure/runtime`** starts the _process's_ resources — database connection, env validation, the
  OTel SDK, signal handlers. No Express anywhere. It was once `core/bootstrap`, which made it look
  like a twin of the app tier's boot steps; it never was.
- **queue consumers are `infrastructure`, not `kernel`.** Sending an email and rendering a PDF are verbs,
  not domains, and neither one stops making sense in an app with no modules — so each consumer sits
  beside the adapter it is the other half of. Only `registerWorkers()` is app-tier, because naming
  which queues this build drains is an assembly fact. A domain-owned worker would belong to its
  module; there is not one yet.

## What a module contains

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 45}}}%%
flowchart TD
    subgraph MOD["src/modules/orders/"]
        IDX["<b>index.ts</b><br/>the public barrel"]
        MAN["<b>module.ts</b><br/>the manifest"]
        RT["routes.ts"]
        CT["controllers/*"]
        SV["service.ts"]
        RP["repository.ts"]
        MD["model.ts"]
        EX["audit.ts · metrics.ts · seeds.ts<br/>locales/ · events.ts · emails.ts"]
        TS["tests/unit · tests/contract"]
    end

    MAN --> RT
    RT --> CT
    CT --> SV
    SV --> RP
    RP --> MD
    IDX -.->|re-exports| SV
    IDX -.->|re-exports| RP

    classDef front fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef layer fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef side fill:#f1f5f9,stroke:#64748b,color:#111827;
    class IDX,MAN front;
    class RT,CT,SV,RP,MD layer;
    class EX,TS side;
```

| File                                                              | Required?                             | What it is                                                   |
| ----------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `module.ts`                                                       | **yes**                               | the manifest — the only file `src/modules.ts` imports        |
| `index.ts`                                                        | only if a sibling imports this module | the public barrel; `observability` and `locales` have none   |
| `routes.ts` + `controllers/`                                      | only if the domain serves HTTP        | `audit-logs` has neither                                     |
| `service.ts` · `repository.ts` · `model.ts`                       | only if it owns data                  | `account` has no model — it is a second service over `users` |
| `audit.ts` · `metrics.ts` · `seeds.ts` · `locales/` · `events.ts` | as needed                             | the domain's slice of what used to be shared registries      |
| `emails.ts`                                                       | only if the domain sends email        | the finished copy of its emails — see below                  |
| `tests/unit/` · `tests/contract/`                                 | yes, in practice                      | deleted with the module                                      |

Nothing central enumerates these. `audit.ts`, `metrics.ts` and `events.ts` register or augment
themselves on import; `seeds` and `locales` are declared in the manifest so the seeder and the i18n
boot can walk the registry without naming a domain.

`emails.ts` is the newest of them and exists for a boundary reason. An email is rendered by
`infrastructure/adapters/email.worker.ts`, which drains a queue possibly in another process, long after
the request that asked for the email ended — so there is no locale store there and nothing to
resolve a translation key against. Rather than rebuild that context in the worker, each module
resolves its own copy while the request is alive: `emails.ts` returns an `IEmailContent` (template
name, subject, and every string the template interpolates), the controller hands it to
`enqueueEmail`, and the job that reaches the worker is finished text. The workers import no i18n
at all, and the templates interpolate rather than translate.

## The manifest

```ts
export default {
    name: 'orders',
    basePath: '/orders',
    routes: router,
    dependsOn: ['products'],
    locales: path.join(__dirname, 'locales'),
    seeds: seedOrdersCollection
} satisfies IAppModule;
```

It is a union of two alternatives, so a domain that owns data but no URL is a first-class entry
rather than a special case:

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 50}}}%%
flowchart LR
    IAM["IAppModule"]
    R["<b>routed</b><br/>basePath + routes<br/><i>8 modules</i>"]
    H["<b>headless</b><br/>basePath?: never<br/>routes?: never<br/><i>audit-logs</i>"]
    IAM --> R
    IAM --> H
    classDef t fill:#dbeafe,stroke:#2563eb,color:#111827;
    class IAM,R,H t;
```

The `never`s are the point: declaring a router with no mount point, or a mount point with nothing to
mount, is a type error at the manifest rather than a route that silently never registers.

**Keep it small.** A field only one module fills does not belong here — that module should do the
thing itself. `subscribe` currently breaks this rule; see [Known gaps](./known-gaps.md#3-subscribe-is-a-manifest-field-with-one-user).

## The dependency graph

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 45, 'rankSpacing': 60}}}%%
flowchart TD
    cart --> products
    cart --> users
    cart --> orders
    orders --> products
    account --> users
    observability --> audit-logs
    feedback["feedback<br/><i>leaf</i>"]
    locales["locales<br/><i>leaf</i>"]

    products -.->|"product.deleted"| cart
    users -.->|"user.deleted"| cart

    classDef domain fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef leaf fill:#dcfce7,stroke:#16a34a,color:#111827;
    class cart,orders,account,observability domain;
    class products,users,feedback,locales,audit-logs leaf;
```

Solid arrows are `dependsOn` — declared, and validated as a **DAG at boot**. Dotted arrows are
domain events going the other way.

That pairing is the answer to mutual need. Deleting a product must empty it from every cart, while
the cart needs the catalogue to price a line. As imports that is a cycle; as one import plus one
event it is a straight edge:

```mermaid
%%{init: {'sequence': {'mirrorActors': false}}}%%
sequenceDiagram
    participant P as products
    participant B as kernel/events
    participant C as cart
    Note over C,P: cart → products is the only IMPORT
    P->>B: emitDomainEvent('product.deleted')
    B->>C: handler (awaited)
    C-->>B: cart lines removed
    B-->>P: all handlers settled
    Note over P: only now is the row deleted
```

Handlers are **awaited in registration order**, so the dependent rows are gone before the owning row
disappears. A handler that throws is logged and does not fail the emitter — a listener must not roll
back an operation that was already authorised.

## Boot order

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 35, 'rankSpacing': 40}}}%%
flowchart TD
    E["validate env"] --> DB["connect database"]
    DB --> CQ["cache · queue · workers"]
    CQ --> L["registerLocaleDirectories&lpar;&rpar;<br/><i>from each manifest</i>"]
    L --> I["i18next.init&lpar;&rpar;<br/><i>reads the merged result</i>"]
    I --> S["listen"]
    RM["registerModules&lpar;&rpar;<br/><i>validate DAG · subscribe</i>"] --> MNT["mount routers by basePath"]
    MNT --> H404["404 catch-all"]

    classDef boot fill:#fef3c7,stroke:#d97706,color:#111827;
    class E,DB,CQ,L,I,S,RM,MNT,H404 boot;
```

Two orderings are load-bearing: locale directories must be registered **before** `i18next.init()`,
which reads the merged dictionaries; and `registerModules` must run **before** the first route
exists, so every subscription is attached before anything can emit.

## Adding and removing a domain

Adding one is a folder plus a line; removing one is `rm -rf` plus deleting that line. The full
procedure — the conditional registries, the bundling, the two-repo step — is
[Adding & removing a module](./module-lifecycle.md). What belongs on this page is why it works and
what it measured.

**It works because nothing central enumerates domains.** Route mounting, the seeder, the i18n boot,
the audit vocabulary and the metrics registry all walk the registry rather than naming its entries,
so none of them is on either checklist. `src/modules.ts` is the one file that names a domain, and
the three `*_SECTION_ORDER` lists are the one exception — the price of a contract assembled from
per-module fragments and shared with the paired frontend.

**And it is measured, in both directions.** `wishlist` was added under it: one folder, one registry
line, three section-order entries, and **zero** edits to any existing file. Deleting `products`,
`cart` and `orders` together gives:

| Tier                  | Files that break              |
| --------------------- | ----------------------------- |
| `src/**` (production) | **0**                         |
| `db/**`               | **0**                         |
| `tests/**`            | 14                            |
| co-located specs      | 1 (`observability`'s metrics) |
| `scripts/**`          | 1                             |

The zeroes are the verdict: **the application tier genuinely does not know which domains exist.**
The rest is residue in test and script code — two of those sixteen are correct and must not be
"fixed", and the largest remaining group is sweep canaries pinned to the current module count. See
[Known gaps §7](./known-gaps.md#7-what-still-breaks-when-domains-are-deleted).

If a module you delete was named in another module's `dependsOn`, the registry stops the boot with
the offending pair named rather than 500-ing on the first request that crosses the gap.

::: tip Run a deletability test after any significant change
Delete two or three domains on a throwaway copy and see what breaks. Nothing in the suite checks
this, and every finding it has ever produced was invisible to `tsc`, to lint and to a fully green
run. The procedure is
[Re-running the deletability check](./module-lifecycle.md#re-running-the-deletability-check).
:::

## What is guarded, and by what

Some of these rules are relational — what a file may import depends on which module owns it — and
`no-restricted-imports` only matches file globs. Those live as tests instead, in
`tests/cross-cutting/`.

| Rule                                                                                  | Guard                              |
| ------------------------------------------------------------------------------------- | ---------------------------------- |
| No module imports a sibling's internals                                               | ESLint `no-restricted-imports`     |
| `infrastructure` and `kernel` never import a module                                   | ESLint, per-tier blocks            |
| A spec may reach its own module, a sibling's barrel, manifest or tests — nothing else | `module-test-boundaries.test.ts`   |
| Two modules never claim the same audit action, and every action is dotted             | `audit-actions.test.ts`            |
| No module shadows a shared locale key, or writes outside its own namespace            | `locale-namespaces.test.ts`        |
| Every language declares the same keys across every module                             | `locale-parity.test.ts`            |
| `infrastructure`'s shared scalars still match every operation in `openapi.yaml`       | `contract-scalars.test.ts`         |
| Every controller handles its own rejections                                           | `every-controller-catches.test.ts` |
| Every mounted route is in the spec, and every spec operation is mounted               | `request-sources.test.ts`          |

Each of these was verified by deliberately breaking it and watching it fail. A guard nobody has seen
fire is a comment.

## Related pages

- [Adding & removing a module](./module-lifecycle.md) — the procedure, with the commands
- [Layers](./layers.md) — the layer stack inside one module
- [Architecture](./architecture.md) — the runtime shape of the service
- [Request Flow](./request-flow.md) — what happens to one request
- [Known gaps](./known-gaps.md) — what is deliberately unfinished
