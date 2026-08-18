# Observability — what the layer is, and what the scan found

`docs/tools/observability-reference.md` maps the **external stack** (Prometheus, Loki, Tempo,
Grafana, the OTel collector) and its config. This file is about the **code in this repo**: what the
layer is made of, which seams hold it together, and the seven things a scan on 2026-08-16 turned up.

It is a discussion document, like `ODDITIES.md` — findings with options and a recommendation each,
not a decision log.

---

## 1 · The layer, in one table

Five signals, one transport, one module. ~2,460 lines total, of which the module is 260.

| Signal          | Mechanism (infrastructure)                                                                                              | What a module contributes                                                                     | Where it goes                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Logs**        | `adapters/logger.ts` (250) — Winston, JSON, two loggers                                                                 | nothing; every tier just logs                                                                 | stdout → Promtail → Loki                                        |
| **Metrics**     | `observability/metrics-http.ts` (350) — the shared `metricsRegistry`, HTTP counters, latency histogram, in-flight gauge | `<module>/metrics.ts` declares counters **onto the shared registry** (5 modules, 12 counters) | `GET /observability/metrics` scraped by Prometheus              |
| **Traces**      | `observability/tracer.ts` (147) — a thin wrapper over the OTel API (`withSpan`, `getActiveSpanContext`)                 | nothing declared; spans are taken where useful                                                | OTLP → collector → Tempo                                        |
| **Audit**       | `observability/audit.ts` (240) — the action vocabulary, `emitAuditEvent`, and the sink port                             | `<module>/audit.ts` augments the action map (10 modules); `audit-logs` **installs the sink**  | a log line always; a Mongo row when the sink is registered      |
| **Analytics**   | `observability/analytics/` (495) — the provider port + `umami` (default), `posthog`, `none`                             | `<module>/analytics.ts` declares event names (6 modules)                                      | the configured provider                                         |
| **Live stream** | `observability/stream.ts` (163) — SSE, 5 s updates, 15 s heartbeat                                                      | —                                                                                             | `GET /observability/events`, shape pinned by `asyncapi.yaml`    |
| **The module**  | `src/modules/observability/` — 3 controllers, no service, no model                                                      | —                                                                                             | `/observability/{health,metrics,metrics/overview,audit,events}` |

### The part that is genuinely well built

Three properties are worth naming before the findings, because they are the constraints any change
has to preserve:

1. **Modules own their vocabulary; infrastructure owns the mechanism.** `audit.ts`, `metrics.ts` and
   `analytics.ts` in a module _augment_ infrastructure's maps by declaration merging. No central
   file enumerates domains, so deleting a module takes its counters and actions with it.
2. **The dashboard reads counters by NAME, never by import.** `get-observability-metrics-overview.ts`
   calls `metricsRegistry.getSingleMetric('auth_login_total')` and reports zero when the metric is
   absent. That is the single most important line in the module: it is why the one component whose
   job is to report on every domain has a `dependsOn` on **none** of them.
3. **Audit fails open, deliberately, in two layers.** The log line is the compliance record and goes
   out first; the queryable Mongo row is a convenience the sink adds, fire-and-forget, swallowing its
   own errors. A Mongo hiccup cannot turn a rejected login into a 500.

---

## 2 · Findings

### F1 · The process snapshot is computed three times, in two units _(the one worth fixing)_

| Where                                                                     | Tier   | Fields                                                                     | Units     |
| ------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- | --------- |
| `infrastructure/observability/stream.ts` → `buildObservabilityPayload()`  | infra  | `uptimeSeconds`, `memory.{rss,heapUsed,heapTotal,external}`                | **bytes** |
| `modules/observability/controllers/get-observability-health.ts`           | module | `uptimeSeconds`, `memory.{heapUsedMb,heapTotalMb,rssMb}`, `os.*`, db state | **MB**    |
| `modules/observability/controllers/get-observability-metrics-overview.ts` | module | `process.{heapUsedMb,uptimeSeconds}`                                       | **MB**    |

Three independent readings of `process.memoryUsage()` and `process.uptime()`, at three instants,
across two tiers. A dashboard rendering the health card beside the live stream is rendering numbers
that cannot be reconciled without arithmetic, and there is no single place to add a fourth field to.

Each shape is _correct for its own contract_ — the SSE payload is bytes because a client differences
consecutive frames; the REST endpoints are megabytes because a human reads them. The duplication is
in the **reading**, not the shaping.

|     | Approach                                                                                                              | Trade                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **`processSnapshot()` in `infrastructure/observability`, raw units; each caller shapes and converts** _(recommended)_ | Additive, no contract changes, ~30 lines. The three response shapes stay exactly as their specs declare. Gives the inevitable fourth copy somewhere to go. |
| B   | Unify the wire units too                                                                                              | Consistent end to end; changes two published contracts and every consumer. Not worth it.                                                                   |
| C   | Leave it                                                                                                              | Free today. The third copy already appeared once without anyone deciding to add it.                                                                        |

### F2 · `request.obs` — a DI seam nothing consumes

`observability/context.ts` bundles `{ audit, analytics }` per request; `middlewares/observability.ts`
attaches it to **every** request; `globals.d.ts` types it. Its docblock says _"Controllers use
`request.obs.audit()` instead of importing singletons directly, enabling easy test injection."_

**Zero controllers do.** All ~53 call sites import `emitAuditEvent` / `emitAnalyticsEvent` directly,
and the unit tests that isolate them use `jest.mock('@infrastructure/observability/audit')` rather
than injection — see `account/tests/unit/delete-account.test.ts`. Two more files (`request-context.ts`,
`middlewares/locale.ts`) describe the idiom as though it were in use.

The cost is small but real: one middleware frame on every request, a global request-type augmentation,
and three docblocks that describe a convention a reader will not find in any controller.

|     | Approach                                                                                                | Trade                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Delete the seam** (context.ts, the middleware, the global, the three docblock claims) _(recommended)_ | Removes ~60 lines and a false trail. Module mocking already works and is what every test does.                                                                             |
| B   | Adopt it — convert controllers to `request.obs.audit(...)`                                              | Genuinely nicer tests, but it is a 53-site change, and audit calls in non-request paths (jobs, subscribers) still need the singleton, so both styles would coexist anyway. |
| C   | Keep it as an option, and say so                                                                        | The status quo, minus the misleading claim. Cheapest honest fix if B is ever wanted.                                                                                       |

### F3 · The health endpoint's `status` reflects the database and nothing else

`overallStatus = databaseStatus === 'connected' ? 'ok' : 'degraded'`. The `integrations` block right
below it reports Loki, OTel, Umami, Faro and the analytics provider — but only as _"is this
configured"_ booleans read off `process.env`, never as reachability. Redis and RabbitMQ are not in
the payload at all, though the app degrades in visible ways when either is down (`getCacheValue`
fails open to a cache miss; `enqueueEmail` cannot queue).

So a deployment with Mongo up and Redis down reports `ok`.

|     | Approach                                                                                                                                                                    | Trade                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A   | **Add real checks for the dependencies that have one** (Redis PING, queue channel state) and let `status` reflect them _(recommended if the endpoint is meant for a probe)_ | Contract change (new fields), and a health endpoint that does I/O needs a timeout budget.                 |
| B   | Rename what exists: `integrations` → `configured`, and document `status` as "database only"                                                                                 | Honest, zero risk, no contract change beyond wording.                                                     |
| C   | Leave it                                                                                                                                                                    | Fine while the endpoint is a dashboard card. Not fine the day someone points a k8s readiness probe at it. |

**Note:** `infrastructure/runtime/database.ts:116` already documents itself as the readiness seam,
and the health controller now uses it (it imported `mongoose` directly until this scan).

### F4 · Two of the five routes cannot be contract-tested from the request side

`observability` gained a contract suite in this pass (17 cases). Two routes stayed out, for transport
reasons rather than contract ones:

- `GET /observability/events` — SSE never completes, so supertest hangs on it. Its payload is
  `asyncapi.yaml`'s to pin anyway.
- `GET /observability/metrics` — the 200 needs `NODE_METRICS_TOKEN` in the process environment.

Worth knowing: the 503 branch (`NODE_METRICS_TOKEN` unset → deny) is a **good** default that no test
currently exercises. A tiny integration test that sets the env var and scrapes would close both gaps.

### F5 · The audit trail can silently stop being queryable

By design, `record()` swallows persistence failures into a `logger.warn`. The compliance record
survives (the log line), the dashboard quietly empties. Nothing alerts on it, and
`GET /observability/audit` answering `{ items: [] }` looks identical to "nothing happened".

**Recommendation:** a counter — `audit_sink_failures_total` in `audit-logs/metrics.ts` (the module
has no `metrics.ts` today) — incremented in that catch. One line, and the failure becomes visible in
the place already built to show it. Do **not** make the sink awaitable; the fail-open is the point.

### F6 · `analytics/none.ts` is the only provider without full coverage

The coverage run flags `functions 50%` against a 70% floor for `src/infrastructure/observability/analytics/none.ts`.
It is a no-op provider — the untested half is almost certainly `shutdown()`. Cheapest fix in the
repo; listed only so it does not get re-discovered as a mystery.

### F7 · ~~The SSE contract is the only AsyncAPI fragment~~ — MIGRATED 2026-08-16

`observability/asyncapi/{channels,messages,schemas}.yaml` — three half-parseable slices — is now one
`observability/asyncapi.yaml`, a complete AsyncAPI document that lints on its own and opens in
Studio. The `worker.*` queues moved to `shared/contracts/asyncapi.workers.yaml` for the same reason
`GET /` sits under `system` in the REST contract: they belong to no domain.

Two things came out of it that are worth knowing here:

- **`asyncapi bundle` could not be used.** It dereferences: every payload is inlined into every
  channel that names it _and_ kept under `components`, taking the document from 239 lines to 819 —
  and `scripts/gen-asyncapi-types.ts` follows `channels[*].{publish,subscribe}.message.$ref` to
  decide what to call a generated model, so a dereferenced document generates different types. The
  merge is 30 lines in `scripts/contracts/asyncapi.ts` instead, and `$ref`s survive untouched.
- **Seven lint warnings became visible** that nobody had ever seen, because a slice could not be
  linted: every `publish`/`subscribe` operation is missing a `description` (they carry `summary`, or
  the channel above them carries one). Warnings, not errors — but real advice, now surfaced by
  `npm run lint:asyncapi:modules`.

---

## 3 · What this layer does NOT have, and probably should not

Recorded so the question stops coming back:

- **No log→trace correlation beyond `trace_id`.** The logger lifts `trace_id` into every line, which
  is what Grafana needs to jump from a log to a span. Nothing more elaborate is warranted.
- **No RED/USE dashboards in-repo.** They live in the Grafana provisioning, not in application code.
- **No per-domain latency histograms.** One HTTP histogram labelled by normalized route covers it;
  a histogram per module would multiply cardinality for a question the route label already answers.
- **No sampling.** Traffic in a boilerplate does not need it, and adding it changes what every
  percentile means.

---

## 4 · Suggested order, if any of this gets done

1. **F2** — delete the dead seam (or demote its docblocks). Pure removal, no contract, no risk.
2. **F1** — one `processSnapshot()`, three callers. Additive.
3. **F5** — the sink-failure counter. One line plus a module `metrics.ts`.
4. **F3** — decide whether `/health` is a dashboard card or a probe, then either rename or add checks.
5. **F6** — cover `none.shutdown()`.
6. **F4** — the two untested routes. **F7** is done; what it left behind is the seven
   `asyncapi-operation-description` warnings, which are a contract improvement rather than a fix.
