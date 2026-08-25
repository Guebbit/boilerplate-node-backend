# audit-logs

::: tip At a glance
**Owns** — the queryable audit trail, kept for the ninety days its TTL index enforces.
**Depends on** — nothing, and nothing imports it. It installs a sink instead.
**Breaks if you change** — the retention window on the `timestamp` index. It is the only thing deleting old entries.
:::

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

## Related pages

- [`observability`](./observability.md) — the module that serves this collection
- [Winston & Audit Logs](../tools/winston.md) — what gets audited and under what action names
- [Modules](../theory/modules.md#the-manifest) — the headless half of the manifest
- [MongoDB & Mongoose](../tools/mongodb-mongoose.md) — TTL indexes
