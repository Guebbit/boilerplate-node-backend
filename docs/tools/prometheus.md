# Prometheus

## What it is

Prometheus is the **metrics backend** of this boilerplate.
It scrapes the app's `/observability/metrics` endpoint every 15 s, stores numeric time-series, evaluates alert rules, and sends firing alerts to Alertmanager.

Grafana reads Prometheus for all metric charts and dashboards.

## Where to find it

- Prometheus UI: `http://localhost:9090`
- Alertmanager UI: `http://localhost:9093`

## System ping

| Route   | Purpose                                                                                         | Success                 |
| ------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| `GET /` | **Ping** — public, always 200 while the process is up (the frontend's API-down banner calls it) | `200`, `API is running` |

Liveness and readiness are separate: `/livez` and `/readyz`, see [Health Checks](./health-checks.md).

## What `/observability/metrics` exposes

| Metric                                                    | Why it is here                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `http_requests_total`                                     | request rate, split by method/route/status                                      |
| `http_request_duration_milliseconds`                      | latency histogram for p50/p95/p99                                               |
| `http_request_errors_total`                               | 4xx/5xx counts                                                                  |
| `http_requests_in_flight`                                 | concurrency at a glance                                                         |
| `dependency_up`                                           | each backing service serving (1) or not (0); unconfigured ones are not reported |
| `cache_invalidation_failures_total`                       | writes whose stale cached response survived                                     |
| `cache_requests_total`                                    | `setCache` lookups by outcome — hit/miss/stale/refresh                          |
| `rate_limit_store_fallback_total`                         | limiter operations served without the `limits` Redis                            |
| `rate_limit_refusals_total`                               | requests refused with 429, by budget                                            |
| `process_unhandled_rejections_total`                      | promise rejections nobody handled (the process keeps running)                   |
| `queue_jobs_dead_lettered_total`                          | jobs parked in a `<queue>.dead`, by queue name                                  |
| `webhook_delivery_attempts_total`                         | outbound webhook delivery attempts, by outcome                                  |
| `webhook_subscriptions_auto_disabled_total`               | subscriptions auto-disabled for sustained failure                               |
| `webhook_deliveries_overdue`                              | pending deliveries more than 10 min past due                                    |
| `security_events_total`                                   | forged or guessed credentials, by `security.*` action                           |
| `auth_stale_credentials_total`                            | expired or revoked credentials presented, by kind                               |
| `auth_one_time_token_rejected_total`                      | refused reset/verify/email-change/delete links, by flow                         |
| `auth_refresh_token_reuse_detected_total`                 | refresh tokens replayed after rotation                                          |
| `audit_sink_failures_total`                               | audit entries that could not be persisted                                       |
| `account_export_failed_total`                             | data exports whose build failed                                                 |
| `outbox_events_published_total` (+ `_retried_`, `_dead_`) | [outbox](./outbox.md) delivery outcomes                                         |
| `db_client_operation_duration_seconds`                    | histogram of every database command, by collection, operation, outcome          |
| `auth_login_total`, `cart_checkout_total`, …              | business counters                                                               |
| `process_*` and `nodejs_*`                                | default `prom-client` runtime metrics                                           |

The `route` label is the template Express matched — `/orders/:id` — read on `finish`, or
`unmatched` for a request that reached no handler. Never a requested path: prom-client evicts
nothing, and a public deployment is scanned against a near-infinite path dictionary, so a label
derived from the URL grows the registry for the life of the process.

## Alert rules

Baseline alert rules live in `docker/observability/prometheus.alert-rules.yaml`. The last three rows live in `docker/observability/prometheus.infra-rules.yaml` instead: they read Prometheus's and Alertmanager's own metrics (and, later, the host's and the proxy's), not the app's, which `tests/cross-cutting/alert-rules-metrics.test.ts` would reject. Both compose files mount it next to the first. The `security.rules` group (login, 2FA, audit, 401/403, rate-limit and rejection signals) is sized for a quiet shop: every threshold carries a "tune to your traffic" comment, and none should be trusted before it has seen yours.

| Alert                                | Condition                                                                                                                                 | Severity           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `ApiDown`                            | scrape target unreachable > 1 min                                                                                                         | critical           |
| `DependencyUnavailable`              | the app reports Mongo (critical, 1 min), Redis or RabbitMQ (warning, 5 min) as not serving (`dependency_up`)                              | critical / warning |
| `ApiRestarting`                      | more than 2 process starts in 15 min: a crash loop (unreliable with clustering on; `ApiDown` mutes it)                                    | critical           |
| `HighErrorRate`                      | 5xx rate > 5 % of requests over 5 min (4xx are the client's, and have their own rules)                                                    | warning            |
| `HighP95Latency`                     | p95 latency > 2 s over 5 min                                                                                                              | warning            |
| `HighInFlightRequests`               | > 100 concurrent requests for 2 min                                                                                                       | warning            |
| `HighHeapUsage`                      | heap > 90 % for 5 min                                                                                                                     | warning            |
| `QueueJobsParked`                    | any job parked in `<queue>.dead` in the last 15 min                                                                                       | warning            |
| `OutboxEventsDead`                   | any outbox event given up on in the last 15 min                                                                                           | warning            |
| `WebhookDeliveriesFailingEverywhere` | zero successful webhook deliveries in 30 min while attempts keep arriving                                                                 | critical           |
| `WebhookRetriesStalled`              | webhook deliveries stay overdue for 15 min straight                                                                                       | warning            |
| `ScheduledJobStale`                  | a nightly `docker/crontab` job has not recorded a success in > 48 h; keeps firing until the job runs again or its `leases` row is deleted | warning            |
| `FrequentSweepStale`                 | `sweep:outbox`, `sweep:payment-effects` or `sweep:reservations` has not succeeded in > 30 min                                             | warning            |
| `ScheduledJobNeverSucceeded`         | a job has been recorded as run for over an hour and has never recorded a success                                                          | warning            |
| `LoginFailureRate`                   | failed logins above 1 per second for 5 min                                                                                                | warning            |
| `LoginFailureShare`                  | over half of logins failing for 10 min, with real traffic                                                                                 | warning            |
| `TwoFactorChallengeFailures`         | login-time 2FA failures above 0.1 per second for 10 min                                                                                   | warning            |
| `TwoFactorDisableFailures`           | any failed attempt to disable 2FA in 15 min                                                                                               | warning            |
| `AuditSinkFailing`                   | any audit entry not persisted in 5 min                                                                                                    | critical           |
| `UnauthorizedForbiddenRate`          | 401 and 403 answers above 2 per second for 10 min                                                                                         | warning            |
| `RateLimitStoreFallback`             | any limiter operation served without the `limits` Redis in 5 min                                                                          | warning            |
| `RateLimitRefusals`                  | one budget refusing over 1 request per second for 10 min                                                                                  | warning            |
| `UnhandledRejections`                | any unhandled promise rejection in 15 min                                                                                                 | warning            |
| `ForgedBearerTokens`                 | more than 10 bad-signature or malformed bearer tokens in 15 min                                                                           | warning            |
| `RevokedApiKeyUsed`                  | a revoked `sk_` key presented with its real secret                                                                                        | warning            |
| `PaymentWebhookSignatureFailures`    | a payment webhook failed its signature check                                                                                              | critical           |
| `MetricsTokenGuessed`                | a wrong bearer token on `/observability/metrics`                                                                                          | warning            |
| `OneTimeTokenGuessing`               | more than 20 refused one-time link tokens on one flow in 15 min                                                                           | warning            |
| `RefreshTokenReuse`                  | a refresh token was replayed after rotation                                                                                               | warning            |
| `PaymentAmountMismatch`              | the provider reported a success for an amount, currency or payment that is not the frozen one                                             | critical           |
| `PaidOrderWithoutHold`               | a paid or shipping order has no stock hold to settle: [runbook](../modules/inventory-reservations.md#orphaned-hold)                       | critical           |
| `AccountExportFailing`               | any personal-data export failed in 15 min (the GDPR deadline is running)                                                                  | warning            |
| `Watchdog`                           | always firing; the heartbeat pushed to `ALERT_HEARTBEAT_URL` (silence there = the pipeline is dead)                                       | none               |
| `AlertmanagerNotificationsFailing`   | Alertmanager failed to send a notification in 15 min (webhook only: email is what is broken)                                              | warning            |
| `PrometheusRuleEvaluationFailures`   | a rule errored while running in the last 15 min                                                                                           | warning            |
| `DiskAlmostFull`                     | a real mount under 10 % free, or predicted full within 24 h by the last 6 h (needs the `monitoring` profile's node_exporter)              | warning            |
| `TlsCertExpiringSoon`                | a certificate Traefik serves expires in under 14 days (needs `docker-compose.proxy.yml`)                                                  | warning            |

### Considered and not used {#alerts-not-used}

The rules page on symptoms, not causes. Each of these was weighed and left out:

| Left out                             | Why                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| MongoDB / Redis / RabbitMQ exporters | they measure causes; the app's own `dependency_up` gauge already sees up/down                         |
| cAdvisor                             | heavy and privileged; `ApiRestarting` and `DependencyUnavailable` catch the same by symptom           |
| blackbox_exporter                    | a probe on the same host cannot see the host die (Gatus on a second machine does); Traefik covers TLS |
| Loki log alerts                      | every failure worth paging already has a counter                                                      |
| CPU / memory / event-loop lag alerts | causes; the latency and in-flight rules are the symptoms                                              |

The image stays on Prometheus `v2.55.1`: the move to v3 is its own upgrade, not taken yet.

## Alertmanager

The routing lives in `docker/observability/alertmanager.config.template.yaml`, rendered from the `ALERT_*` knobs by
`docker/observability/alertmanager-render.sh` when the container starts. The routing table and the knobs are written up with the rest of
the alerting set-up (see [Alert routing](#alert-routing)).

## Alert routing

Prometheus evaluates the rules; Alertmanager decides who is told. The routing is one template
(`alertmanager.config.template.yaml`), rendered when the container starts from the client's `.env`: Alertmanager
reads no environment variables, and its email `to` / `from` / `smarthost` have no `_file` form.
Same routing for every client and for dev; only the values differ.

| Alert                              | Goes to                | Why                                                |
| ---------------------------------- | ---------------------- | -------------------------------------------------- |
| `Watchdog`                         | the heartbeat URL only | silence on the other end = the pipeline is dead    |
| `AlertmanagerNotificationsFailing` | the webhook only       | email is the thing that is broken                  |
| `severity: critical`               | email **and** webhook  | a phone push for what cannot wait                  |
| everything else                    | email                  | through the app's own SMTP account (`NODE_SMTP_*`) |

| Knob                                 | Meaning                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` | who receives the email, and from what address (`from` falls back to `NODE_SMTP_USER`) |
| `ALERT_WEBHOOK_URL`                  | ntfy, Slack, Telegram, Matrix... the operator's choice                                |
| `ALERT_HEARTBEAT_URL`, `_TOKEN`      | the off-host service that raises the alarm when the `Watchdog` pings stop             |

- **Empty knob, route off.** Its alerts go to `null` and nothing warns about it at boot. Email needs
  `ALERT_EMAIL_TO`, a sender and `NODE_SMTP_HOST`; with `NODE_SMTP_PASS` empty no SMTP login is sent.
- **Secrets stay out of the config.** The webhook and heartbeat URLs, the token and the SMTP password are
  written to `0600` files at start and read through Alertmanager's `url_file` / `*_file` forms, so they do not
  show in `/api/v2/status`.
- **Values are escaped** (`/`, `&`, `\` and `'`) before they reach the template, so an address or a password can
  contain them.
- **Local stack.** Email defaults to mailpit (`integrations` profile, `http://localhost:8025`) and needs no
  `.env` change.

### The local drill

Proves the whole chain on your machine: a rule fires, Alertmanager routes it, a mail arrives.
Mailpit lives in the `integrations` profile, so start it with the `observability` one.

1. `npm run compose -- --profile observability --profile integrations up -d`
2. `npm run compose -- stop app`.
3. Within about 2 minutes `[FIRING:1] ApiDown` arrives in the mailpit inbox (`http://localhost:8025`):
   1 minute for the rule's `for`, 30 seconds of grouping.
4. `npm run compose -- start app`: the resolution mail follows.

The heartbeat drill is the same idea one level up: stop `alertmanager` instead, and within about 3 minutes Gatus
mails that the heartbeat is missing. See [Gatus](./gatus.md#the-local-drill).
Repeat the first drill on a staging stack before go-live.

## Observability endpoints

See [Observability Endpoints](../api/observability.md) for the full list. Key routes:

| Route                                 | Auth                                  | Returns                                                                                   |
| ------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /observability/metrics`          | scraper bearer (`NODE_METRICS_TOKEN`) | Raw Prometheus exposition (text/plain) — scrape target                                    |
| `GET /observability/health`           | `read:ObservabilitySnapshot`          | Full health snapshot: DB status, memory, CPU, integration flags, uptime                   |
| `GET /observability/metrics/overview` | `read:ObservabilitySnapshot`          | KPI summary: HTTP totals, error rate, in-flight count, p50/p95 latency, business counters |
| `GET /observability/audit`            | `read:ObservabilitySnapshot`          | Recent incidents from the persisted audit trail, newest first                             |

These endpoints return **curated, domain-shaped summaries** — they are the data layer for a custom frontend, not raw Prometheus query results.

## SSE metrics stream

- `GET /observability/events` (`text/event-stream`, authenticated by refresh cookie, needs `read:ObservabilitySnapshot`)

Emits `metrics.snapshot` immediately on connect, then `metrics.updated` every 5 s and a `heartbeat` every 15 s.

Use this for live widgets in a custom UI. For historical charts, query your backend (which can read Prometheus), not process-local memory.

## Works with

- **[Grafana](./grafana.md)** — Grafana is the primary consumer of Prometheus data. Every metric chart and KPI panel in the dashboard reads from Prometheus. You rarely need to query Prometheus directly; Grafana's Explore view is the normal entry point. → [Works with Prometheus](./grafana.md#works-with)
- **Alertmanager** — Prometheus evaluates the rules in `docker/observability/prometheus.alert-rules.yaml` and pushes firing alerts to Alertmanager, which groups and routes them to notification receivers. The receivers are chosen by the `ALERT_*` knobs; with none set, everything goes to `null` (no notifications). Both share the same [Observability Reference](./observability-reference.md) config tables.

## External references

- [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/) — needed to write queries in [Grafana](./grafana.md)'s Prometheus Explore view

## Related pages

- [Observability Reference](./observability-reference.md)
- [Grafana](./grafana.md)
- [Tempo](./tempo.md)
- [OpenTelemetry](./opentelemetry.md)
