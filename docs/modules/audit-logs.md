# audit-logs

::: tip At a glance
**Owns** — the queryable audit trail, kept for the ninety days its TTL index enforces.
**Depends on** — nothing, and nothing imports it. It installs a sink instead.
**Breaks if you change** — the retention window on the `timestamp` index. It is the only thing deleting old entries.
:::

## Its neighbourhood

<!-- module-graph:audit-logs:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    audit_logs["audit-logs<br/><i>this module</i>"]
    observability["observability"]

    observability --> audit_logs

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class observability generic;
    class audit_logs centre;
```

<!-- module-graph:audit-logs:end -->

## The story

**This module declares no router, and that is the whole point of the headless half of the
manifest.** The domain owns a collection, so it is a module. The one endpoint that reads it —
`GET /observability/audit` — belongs to [`observability`](./observability.md), the dashboard that
renders the data rather than the data itself.

Enabling this module without `observability` gives you an audit trail nothing exposes. That is a
legitimate build, not a broken one.

::: tip How ~53 call sites reach a module nothing imports
They do not. Every `emitAuditEvent` call in the app talks to
`@infrastructure/observability/audit`, which knows only that a sink _may_ exist. **This module
installs that sink itself, at import time** — the same way a routed module hands over a router.

Registering a function is not a database call: `record` is fire-and-forget and only touches Mongo
when an entry actually fires, which cannot happen before the app serves a request. Doing it here
rather than in `app.ts` is what keeps the assembly file from naming a domain. With this module
deleted, the audit trail stops being stored and everything else still builds.
:::

Retention is a database fact, not a cron job: `expireAfterSeconds: 7776000` on `timestamp` is
ninety days, enforced by Mongo. The two compound indexes are the two questions anyone asks of a
trail — everything one actor did, and everyone who did one thing.

Field names are `snake_case` here and `camelCase` everywhere else, because an audit row is a log
record rather than a domain document.

## The pipeline

The gap in the middle is the design. No call site imports this module; it installs a sink and the
infrastructure finds it.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    C["~53 call sites<br/><i>emitAuditEvent</i>"] --> P["@infrastructure/observability/audit<br/><i>knows only that a sink may exist</i>"]
    P -.->|"the sink, installed at import time"| R["record<br/><i>fire-and-forget</i>"]
    R --> M[("auditlogs")]
    M -->|"TTL · expireAfterSeconds 7776000"| X(("gone after<br/>90 days"))
    O["observability<br/><i>GET /observability/audit</i>"] --> M

    classDef caller fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef seam fill:#f1f5f9,stroke:#94a3b8,color:#111827,stroke-dasharray:4 3;
    classDef own fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class C,O caller;
    class P seam;
    class R,M,X own;
```

## Related pages

- [`observability`](./observability.md) — the module that serves this collection
- [Winston & Audit Logs](../tools/winston.md) — what gets audited and under what action names
- [Modules](../theory/modules.md#the-manifest) — the headless half of the manifest
- [MongoDB & Mongoose](../tools/mongodb-mongoose.md) — TTL indexes
