# audit-logs

::: tip At a glance
**Owns** — the queryable audit trail, kept for `NODE_AUDIT_RETENTION_DAYS` (180 by default), which its TTL index enforces.
**Depends on** — [`access`](./access.md), only for the refusal reasons its read side lists. Nothing, for the write side: nothing imports this module, it installs a sink instead.
**Breaks if you change** — the retention window (`NODE_AUDIT_RETENTION_DAYS`) on the `timestamp` index. It is the only thing deleting old entries.
:::

## Its neighbourhood

<!-- module-graph:audit-logs:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    audit_logs["audit-logs<br/><i>this module</i>"]
    access["access"]
    observability["observability"]

    observability --> audit_logs
    audit_logs --> access

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class access,observability generic;
    class audit_logs centre;
```

<!-- module-graph:audit-logs:end -->

## The story

**One collection, two readers, and neither is this module's own write path.** The write side is headless — see the tip below. The read side has two doors.
[`observability`](./observability.md)'s `GET /observability/audit` is gated on
`read:ObservabilitySnapshot` — a key only the platform operator holds, and therefore useless to a
shop's own staff.

This module owns the tenant-facing door onto the same collection: `GET /audit`, gated on
`read:AuditLog` — held by `admin` only in `shared/rules/authorization-roles.yaml`.
Same rows, same shape, different audience: `observability`'s route answers "what happened across
every shop", this module's own route answers "what happened in mine". Enabling this module without
`observability` gives a working `GET /audit` and no platform-wide view — a legitimate build, just a
narrower one.

::: tip How every call site reaches a module nothing imports, for the WRITE
They do not, even though the module has a router. Every
`recordAudit` / `emitAuditEvent` call in the app talks to `@infrastructure/observability/audit`, which knows only
that a sink _may_ exist. **This module installs that sink itself, from its own `onRegistered`
hook** — run once every enabled module is known, not merely on import, the same way it hands
`mounts` to the app tier for the read side.

Registering a function is not a database call: `record` is fire-and-forget and only touches Mongo
when an entry actually fires, which cannot happen before the app serves a request. Doing it here
rather than in `app.ts` is what keeps the assembly file from naming a domain, and doing it from
`onRegistered` rather than at import time means importing this file for a type or a test does not
install the sink. With this module deleted, the audit trail stops being stored and everything
else still builds.
:::

Retention is a database fact, not a cron job: `expireAfterSeconds` on `timestamp` is
`NODE_AUDIT_RETENTION_DAYS` days (180 by default), enforced by Mongo. Mongo will not change an
existing TTL index's window in place: a new value fails the boot until `npm run db:sync` rebuilds
the index. The compound indexes are the questions anyone asks of a trail — everything one actor
did, everyone who did one thing, what happened to one row, and whose data a row was about.

Field names are `camelCase` in the event, in Mongo and in the API, like every other collection. The
log line is the one place they change: the Winston formatter renames them to OpenTelemetry
semantic-convention names (`actorUserId` becomes `user.id`) on the way out. See
[Winston](../tools/winston.md#field-names-in-the-log-line).

One row shape, `AuditEntryItem`, answers every read: `GET /audit`, `GET /observability/audit` and the
account export. `actorCredentialId` names the API key when a credential did the action, and is absent
when a person did. `subjectId` names the person whose data the row is about, when that is not the
actor: a staff read of someone's record sets it, and `GET /audit?subject=<id>` is the staff-side
answer to "who looked at this person's data".

## The person can see who looked {#the-person-can-see-who-looked}

A staff member opening someone else's record writes `admin.<resource>.viewed` with the person's id
as `subjectId` (`src/kernel/staff-read.ts`). The person's own data export then carries a
`consultations` section: when, which kind of record, and why. Never the staff member: the EU court
(C-579/21, Art. 15) gives a person the dates and purposes of each consultation, not the employee's name.

```mermaid
flowchart LR
    S["staff opens a record"] --> W["recordStaffRead<br/><i>subjectId = whose it is</i>"]
    W --> A[("auditlogs")]
    A -->|"subjectId + a staff-read action,<br/>inside the window"| C["consultations section<br/><i>date, record kind, purpose</i>"]
    C --> E["the person's data export"]
```

- **Purpose** comes from one fixed map, `STAFF_READ_PURPOSES` in `src/kernel/staff-read.ts`
  (`admin.order.viewed` is "handling your order"). It is also the list of actions that count as a
  consultation: a new `admin.<resource>.viewed` is added there, or it never reaches the export.
- **Window** is `NODE_AUDIT_RETENTION_DAYS`, and the section says so (`windowDays`). Retention is not
  extended to answer the request: the ruling covers the logs that are held, not how long they are kept.
- **Limits, stated rather than hidden:** a guest's order has no person to name, so it has no
  `subjectId`; the orders CSV export (`GET /orders/export`) names no person either; a return's
  `subjectId` is the order's buyer, resolved at read time and stored only on the audit row.
- **Erasure:** no erase hook. Rows that name an erased person expire with the log window. The
  trail is kept for accountability, so the shop can show who accessed data (GDPR Art. 17(3)(e), and
  Art. 5(2)).

## Offline writes

`bufferCommands: false` on this schema fails a write immediately when Mongo is unreachable,
instead of queueing it.

Mongoose's default is to BUFFER any operation issued while disconnected and hold it for
`bufferTimeoutMS` — ten seconds — before rejecting. For every other collection here that is the
right behaviour: it rides out a reconnect and the request waiting on the answer gets one.

This collection is the exception, because nothing waits on it. `auditLogService.record` is
fire-and-forget by contract and the audit LOG LINE is the compliance record — the stored copy is
the queryable convenience on top of it. Buffering cannot save an entry that matters; it only
converts "not persisted, logged, moved on" into a pending timer per audited request, held for ten
seconds each, for as long as Mongo is away.

A suite that runs with no database, such as `tests/integration/locale.test.ts`, shows the cost:
each rejected signup emits `auth.signup.failed`, and a buffered insert would leave a 10s timer
holding the worker's event loop open.

## The pipeline

The gap in the middle is the design on the write side. No call site imports this module; it
installs a sink and the infrastructure finds it. The read side is unremarkable by comparison — two
ordinary routes, in two different modules, over one collection.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    C["every call site<br/><i>recordAudit</i>"] --> P["@infrastructure/observability/audit<br/><i>knows only that a sink may exist</i>"]
    P -.->|"the sink, installed by onRegistered"| R["record<br/><i>fire-and-forget</i>"]
    R --> M[("auditlogs")]
    M -->|"TTL · NODE_AUDIT_RETENTION_DAYS"| X(("gone after<br/>retention"))
    O["observability<br/><i>GET /observability/audit</i><br/>read:ObservabilitySnapshot"] --> M
    S["this module's own route<br/><i>GET /audit</i><br/>read:AuditLog"] --> M

    classDef caller fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef seam fill:#f1f5f9,stroke:#94a3b8,color:#111827,stroke-dasharray:4 3;
    classDef own fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class C,O,S caller;
    class P seam;
    class R,M,X own;
```

**The operator's read is an incident feed, not the trail.** `GET /observability/audit` goes through
`searchIncidents`, which ANDs the operator's own filters with an allow-list (`INCIDENT_SCOPE` in
`service.ts`): the `security.*` actions, a refused sign-in, a failed second-factor
challenge or provider sign-in, a reused refresh token and an auto-disabled webhook. The one
`security.forbidden` it drops is the shop's own refusal of a staff account (`metadata.reason` is
`role_protected`): staff refused an account that holds a role is the shop's business and names an
account. Orders, payments, products and successful sign-ins stay on the shop's own `GET /audit`, and every address
is returned as a keyed digest (`hmac:…`): the operator can correlate "this address, three
incidents" and never read the address. An operator watching an installation needs the incidents,
and holding no shop key was never meant to include reading a shop's customers.

The stored row's `metadata` is credential-scrubbed before it is written (a `password` or `token` key becomes `[REDACTED]`), exactly as the log line's is; `ip` stays raw in the row on purpose.

## What an update records

Every `*.updated` audit row says what the edit moved, through one pure helper,
`auditChanges(before, data, { valued, named })` in `infrastructure/observability/audit-changes.ts`.
The trail is append-only and never scrubbed on erasure, so the rule is an allowlist, not a diff of
everything:

| Form           | Where in `metadata` | For which fields                                               |
| -------------- | ------------------- | -------------------------------------------------------------- |
| `{ from, to }` | `changes.<field>`   | non-personal fields: prices, flags, preferences, display names |
| the name only  | `changedFields[]`   | free text, personal data, bearer secrets                       |
| nothing        |                     | every field on neither list                                    |

The caller snapshots "before" ahead of any in-place assignment. Where the write is atomic and
returns no previous value (the backorder limit), it reads first.

Which fields of which action go in which column is the `valued` / `named` argument at each call site; the list of audited actions is generated in [the logging page](../tools/winston.md). The policy is the table above: a non-personal field by value, free text, personal data and bearer secrets by name, everything else not at all.

`admin.translation.updated` already lists the locales it upserted and deleted; the text itself is
free text and stays out.

`GET /audit` also filters on `ownOrder` (`true` keeps the entries flagged `metadata.ownOrder`,
`false` the rest) so staff can separate actions on their own orders from actions on customers'.

## Who can do what

Every rule this module declares and who holds it, role by role. The rule is what a route guard asks for; the set is what a role lists.

<!-- permissions:start -->

| Rule            | Set            | `guest` | `unverified` | `customer` | `manager` | `warehouse` | `support` | `editor` | `moderator` | `admin` | `operator` | Credential | What it lets them do                                                      |
| --------------- | -------------- | ------- | ------------ | ---------- | --------- | ----------- | --------- | -------- | ----------- | ------- | ---------- | ---------- | ------------------------------------------------------------------------- |
| `read:AuditLog` | `AuditDisplay` | —       | —            | —          | —         | —           | —         | —        | —           | ✅      | —          | ✅         | Read the audit trail. There is no write key — nothing edits an audit row. |

✅ held · `own` only the caller’s own rows · ⚡c / ⚡s needs a freshly proved session (critical / sensitive) ·
Credential: ✅ when an API key can be minted with the rule. Generated from the rules and sets in
`src/modules/*/authorization.yaml` and the roles in `shared/rules/authorization-roles.yaml`, asked of the
evaluator — [Authorization](../theory/authorization.md) explains the model.

<!-- permissions:end -->

## Related pages

- [`observability`](./observability.md) — the module's OTHER reader, `GET /observability/audit`
- [Authorization](../theory/authorization.md) — `read:AuditLog`, and why a bare key can never answer a platform question
- [Winston & Audit Logs](../tools/winston.md) — what gets audited and under what action names
- [Modules](../theory/modules.md#the-manifest) — the headless half of the manifest, for the write side
- [MongoDB & Mongoose](../tools/mongodb-mongoose.md) — TTL indexes
