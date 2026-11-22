---
type: concept
audience: [operator]
---

# Prometheus

Prometheus is the **metrics backend** of this boilerplate.
It scrapes the app's and the queue worker's `/observability/metrics` endpoints every 15 s (two alert counters, `queue_jobs_dead_lettered_total` and `webhook_delivery_attempts_total`, move only in the worker), stores numeric time-series, evaluates alert rules, and sends firing alerts to Alertmanager.

## What it is

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

| Metric                                                    | Why it is here                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `http_requests_total`                                     | request rate, split by method/route/status                                                      |
| `http_request_duration_milliseconds`                      | latency histogram for p50/p95/p99                                                               |
| `http_request_errors_total`                               | 4xx/5xx counts                                                                                  |
| `http_requests_in_flight`                                 | concurrency at a glance                                                                         |
| `dependency_up`                                           | each backing service serving (1) or not (0); unconfigured ones are not reported                 |
| `cache_invalidation_failures_total`                       | writes whose stale cached response survived                                                     |
| `cache_requests_total`                                    | `setCache` lookups by outcome — hit/miss/stale/refresh                                          |
| `query_timeouts_total`                                    | database queries killed at the time limit (answered 503 `QUERY_TIMEOUT`)                        |
| `rate_limit_store_fallback_total`                         | limiter operations served without the `limits` Redis                                            |
| `rate_limit_refusals_total`                               | requests refused with 429, by budget                                                            |
| `process_unhandled_rejections_total`                      | promise rejections nobody handled (the process keeps running)                                   |
| `queue_jobs_dead_lettered_total`                          | jobs parked in a `<queue>.dead`, or as `dead` in the fallback queue, by queue name              |
| `queue_held_jobs`, `queue_held_jobs_oldest_age_seconds`   | jobs held in the database while the broker was down, by channel: how many, and the oldest's age |
| `webhook_delivery_attempts_total`                         | outbound webhook delivery attempts, by outcome                                                  |
| `webhook_subscriptions_auto_disabled_total`               | subscriptions auto-disabled for sustained failure                                               |
| `webhook_deliveries_overdue`                              | pending deliveries more than 10 min past due                                                    |
| `security_events_total`                                   | forged or guessed credentials, by `security.*` action                                           |
| `auth_stale_credentials_total`                            | expired or revoked credentials presented, by kind                                               |
| `auth_one_time_token_rejected_total`                      | refused reset/verify/email-change/restore links, by flow                                        |
| `auth_refresh_token_reuse_detected_total`                 | refresh tokens replayed after rotation                                                          |
| `audit_sink_failures_total`                               | audit entries that could not be persisted                                                       |
| `account_export_failed_total`                             | data exports whose build failed                                                                 |
| `outbox_events_published_total` (+ `_retried_`, `_dead_`) | [outbox](../understand/outbox.md) delivery outcomes                                             |
| `db_client_operation_duration_seconds`                    | histogram of every database command, by collection, operation, outcome                          |
| `auth_login_total`, `cart_checkout_total`, …              | business counters                                                                               |
| `process_*` and `nodejs_*`                                | default `prom-client` runtime metrics                                                           |

The `route` label is the template Express matched — `/orders/:id` — read on `finish`, or
`unmatched` for a request that reached no handler. Never a requested path: prom-client evicts
nothing, and a public deployment is scanned against a near-infinite path dictionary, so a label
derived from the URL grows the registry for the life of the process.

## Alert rules

Baseline alert rules live in `docker/observability/prometheus.alert-rules.yaml`. The last four rows (`Watchdog`, `AlertmanagerNotificationsFailing`, `PrometheusRuleEvaluationFailures`, `DiskAlmostFull`) live in `docker/observability/prometheus.infra-rules.yaml` instead: they read Prometheus's and Alertmanager's own metrics (and the host's), not the app's, which `tests/cross-cutting/alert-rules-metrics.test.ts` would reject. Both compose files mount it next to the first. The `security.rules` group (login, 2FA, audit, 401/403, rate-limit and rejection signals) is sized for a quiet shop: every threshold carries a "tune to your traffic" comment, and none should be trusted before it has seen yours.

**Certificate expiry is not an alert rule here.** The only certificate-expiry check is Gatus's `[CERTIFICATE_EXPIRATION]` condition on the second machine (see [Gatus](./gatus.md)). Without Gatus, nothing warns: Let's Encrypt stopped sending expiry emails on 2025-06-04.

| Alert                                | What it means                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiDown`                            | scrape target unreachable > 1 min                                                                                                                                                                   |
| `WorkerDown`                         | the queue worker's scrape target unreachable > 1 min: queued jobs (mail, image digests, webhooks) are not being taken                                                                               |
| `HeldJobsStuck`                      | the oldest job held in the database fallback queue for a channel has waited > 15 min (`queue_held_jobs_oldest_age_seconds`): no worker of the role that takes it is draining. Held jobs have no TTL |
| `DependencyUnavailable`              | the app reports Mongo (critical, 1 min), Redis or RabbitMQ (warning, 5 min) as not serving (`dependency_up`)                                                                                        |
| `ApiRestarting`                      | more than 2 process starts in 15 min: a crash loop (scrape every copy as its own target; `ApiDown` mutes it)                                                                                        |
| `HighErrorRate`                      | 5xx rate > 5 % of requests over 5 min (4xx are the client's, and have their own rules)                                                                                                              |
| `HighP95Latency`                     | p95 latency > 2 s over 5 min                                                                                                                                                                        |
| `HighInFlightRequests`               | > 100 concurrent requests for 2 min                                                                                                                                                                 |
| `HighHeapUsage`                      | heap > 90 % for 5 min                                                                                                                                                                               |
| `QueueJobsParked`                    | any job parked in `<queue>.dead` in the last 15 min                                                                                                                                                 |
| `OutboxEventsDead`                   | any outbox event given up on in the last 15 min                                                                                                                                                     |
| `WebhookDeliveriesFailingEverywhere` | zero successful webhook deliveries in 30 min while attempts keep arriving                                                                                                                           |
| `WebhookRetriesStalled`              | webhook deliveries stay overdue for 15 min straight                                                                                                                                                 |
| `ScheduledJobStale`                  | a nightly `docker/crontab` job has not recorded a success in > 48 h; keeps firing until the job runs again or its `leases` row is deleted                                                           |
| `FrequentSweepStale`                 | `sweep:outbox`, `sweep:payment-effects` or `sweep:reservations` has not succeeded in > 30 min                                                                                                       |
| `ReservationExpiryFailing`           | `inventory_overdue_holds` (holds still open > 10 min past their deadline) stays above zero for 15 min; the sweep itself still succeeds, so `FrequentSweepStale` stays quiet                         |
| `ScheduledJobNeverSucceeded`         | a job has been recorded as run for over an hour and has never recorded a success                                                                                                                    |
| `LoginFailureRate`                   | failed logins above 1 per second for 5 min                                                                                                                                                          |
| `LoginFailureShare`                  | over half of logins failing for 10 min, with real traffic                                                                                                                                           |
| `TwoFactorChallengeFailures`         | login-time 2FA failures above 0.1 per second for 10 min                                                                                                                                             |
| `TwoFactorDisableFailures`           | any failed attempt to disable 2FA in 15 min                                                                                                                                                         |
| `AuditSinkFailing`                   | any audit entry not persisted in 5 min                                                                                                                                                              |
| `UnauthorizedForbiddenRate`          | 401 and 403 answers above 2 per second for 10 min                                                                                                                                                   |
| `RateLimitStoreFallback`             | any limiter operation served without the `limits` Redis in 5 min                                                                                                                                    |
| `RateLimitRefusals`                  | one budget refusing over 1 request per second for 10 min                                                                                                                                            |
| `UnhandledRejections`                | any unhandled promise rejection in 15 min                                                                                                                                                           |
| `ForgedBearerTokens`                 | more than 10 bad-signature or malformed bearer tokens in 15 min                                                                                                                                     |
| `RevokedApiKeyUsed`                  | a revoked `sk_` key presented with its real secret                                                                                                                                                  |
| `PaymentWebhookSignatureFailures`    | a payment webhook failed its signature check                                                                                                                                                        |
| `MetricsTokenGuessed`                | a wrong bearer token on `/observability/metrics`                                                                                                                                                    |
| `OneTimeTokenGuessing`               | more than 20 refused one-time link tokens on one flow in 15 min                                                                                                                                     |
| `RefreshTokenReuse`                  | a refresh token was replayed after rotation                                                                                                                                                         |
| `PaymentAmountMismatch`              | the provider reported a success for an amount, currency or payment that is not the frozen one                                                                                                       |
| `PaymentWebhookUnreadable`           | a signed provider message the adapter or schema could not read: [guide](../modules/payments-disputes-and-adapters.md#a-signed-message-the-app-could-not-read)                                       |
| `PaymentWebhookFailing`              | the payment webhook route answered a 5xx in 30 min                                                                                                                                                  |
| `PaidOrderWithoutHold`               | a paid or shipping order has no stock hold to settle: [runbook](../modules/inventory-reservations.md#orphaned-hold)                                                                                 |
| `AccountExportFailing`               | any personal-data export failed in 15 min (the GDPR deadline is running)                                                                                                                            |
| `Watchdog`                           | always firing; the heartbeat pushed to `ALERT_HEARTBEAT_URL` (silence there = the pipeline is dead)                                                                                                 |
| `AlertmanagerNotificationsFailing`   | Alertmanager failed to send a notification in 15 min (a failing email goes to the webhook, any other failing channel goes to email)                                                                 |
| `PrometheusRuleEvaluationFailures`   | a rule errored while running in the last 15 min                                                                                                                                                     |
| `DiskAlmostFull`                     | a real mount under 10 % free, or predicted full within 24 h by the last 6 h (needs the `monitoring` profile's node_exporter)                                                                        |

The expression, the `for` and the severity of each are in the rules file; the conditions above are the meaning, not a copy of the thresholds.

### Considered and not used {#alerts-not-used}

The rules page on symptoms, not causes. Each of these was weighed and left out:

| Left out                             | Why                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| MongoDB / Redis / RabbitMQ exporters | they measure causes; the app's own `dependency_up` gauge already sees up/down                                                            |
| cAdvisor                             | heavy and privileged; `ApiRestarting` and `DependencyUnavailable` catch the same by symptom                                              |
| blackbox_exporter                    | a probe on the same host cannot see the host die (Gatus on a second machine does); certificate expiry is watched only by Gatus, off-host |
| Loki log alerts                      | every failure worth paging already has a counter                                                                                         |
| CPU / memory / event-loop lag alerts | causes; the latency and in-flight rules are the symptoms                                                                                 |

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

| Alert                              | Goes to                           | Why                                                                                                                           |
| ---------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Watchdog`                         | the heartbeat URL only            | silence on the other end = the pipeline is dead                                                                               |
| `AlertmanagerNotificationsFailing` | the OTHER channel                 | a failing email goes to the webhook, a failing webhook (or the heartbeat) goes to email: never to the receiver that is broken |
| `severity: critical`               | every channel that is on, at once | email, the webhook, and the [phone push](#phone-push) (ntfy, Telegram, Pushover): what cannot wait                            |
| everything else                    | email                             | through the app's own SMTP account (`NODE_SMTP_*`)                                                                            |

| Knob                                                 | Meaning                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`                 | who receives the email, and from what address (`from` falls back to `NODE_SMTP_USER`)          |
| `ALERT_WEBHOOK_URL`                                  | Alertmanager's generic webhook, for a bridge you run; critical alerts and failed notifications |
| `ALERT_NTFY_URL`, `ALERT_NTFY_TOKEN`                 | [ntfy](#phone-push-ntfy): the topic URL (the credential), and an optional bearer token         |
| `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` | [Telegram](#phone-push-telegram): the bot, and the chat it writes to                           |
| `ALERT_PUSHOVER_USER_KEY`, `ALERT_PUSHOVER_TOKEN`    | [Pushover](#phone-push-pushover): the account's user key, and the application's token          |
| `ALERT_HEARTBEAT_URL`, `_TOKEN`                      | the off-host service that raises the alarm when the `Watchdog` pings stop                      |

- **The webhook is Alertmanager's generic one.** It posts a fixed JSON body (`{"version":"4","alerts":[...]}`) that
  Alertmanager cannot reshape. Slack, Discord and Matrix reject that body or need a bridge in front of it, and a bridge is
  yours to run. Telegram, Pushover and ntfy do not need one: they have their own groups below.
- **Empty knob, route off.** Its alerts go to `null` and nothing warns about it at boot. A group that needs two
  knobs (Telegram, Pushover) is on only when both are set. Email needs
  `ALERT_EMAIL_TO`, a sender and `NODE_SMTP_HOST`; with `NODE_SMTP_PASS` empty (in production, an empty `smtp_password` file) no SMTP login is sent.
- **Secrets stay out of the config.** The webhook and heartbeat URLs, every token and key and the SMTP password are
  written to `0600` files at start and read through Alertmanager's `url_file` / `*_file` forms, so they do not
  show in `/api/v2/status`.
- **In production the secrets are files.** The webhook URL, the heartbeat token, the push credentials and the SMTP
  password reach the container as `alert_webhook_url`, `alert_heartbeat_token`, `alert_ntfy_url`, `alert_ntfy_token`,
  `alert_telegram_bot_token`, `alert_pushover_user_key`, `alert_pushover_token` and `smtp_password`
  ([secret files](first-deploy.md#secrets)), through `ALERT_WEBHOOK_URL_FILE` and its siblings; an empty
  file is unset. Dev keeps the plain `ALERT_*` variables. The Telegram chat id is a number, not a secret, and stays in `.env`.
- **Values are escaped** (`/`, `&`, `\` and `'`) before they reach the template, so an address or a password can
  contain them.
- **Local stack.** Email defaults to mailpit (`integrations` profile, `http://localhost:8025`) and ntfy to a local
  `ntfy` service (`observability` profile, `http://localhost:3073`); neither needs a `.env` change.

### Phone push {#phone-push}

A `critical` alert reaches the operator's phone through whichever of three channels have their knobs set. They can
all be on at once, and they share one `critical` receiver, so adding a channel never changes the routes. Warnings
stay on email; the heartbeat and the "notifications failing" routes are untouched.

| Channel  | How                                                  | What the phone does                                       | Cost             |
| -------- | ---------------------------------------------------- | --------------------------------------------------------- | ---------------- |
| ntfy     | the webhook, ntfy's own `alertmanager` template      | Android: an urgent push overrides Do Not Disturb          | free, self-host  |
| Telegram | Alertmanager's native `telegram_configs`             | a normal chat notification                                | free             |
| Pushover | Alertmanager's native `pushover_configs`, priority 2 | repeats every 5 minutes until acknowledged, for up to 1 h | about 5 USD once |

The resolution is not pushed urgently: Pushover gets it as an ordinary message, and the ntfy push is sent for the
firing alert only (its priority is part of the URL, so a resolution would buzz too). Telegram carries both.

#### ntfy {#phone-push-ntfy}

Alertmanager has no native ntfy receiver, so the push is its generic webhook pointed at ntfy, and ntfy's built-in
`alertmanager` template (ntfy 2.14 or later) turns the JSON into a readable title and message. No bridge, no code of ours.
Set the **topic URL**; the render appends `?template=alertmanager&priority=urgent` itself:

```
ALERT_NTFY_URL=https://ntfy.example.com/some-long-random-topic
```

The topic name is the credential on a server with no access control, so pick a long random one and treat the URL as a
secret (in production it is the `alert_ntfy_url` file). On a server that does have access control, give Alertmanager a
token (`tk_…`, `ntfy token add`) in `ALERT_NTFY_TOKEN` and it sends it as a bearer header. Template reference:
<https://docs.ntfy.sh/publish/#message-templating>.

**Your own ntfy server.** A deployer who already runs one just points the URL at it. Otherwise this is enough beside the
stack (it is a recipe, not a service of ours, so the boilerplate picks no host or provider):

```yaml
ntfy:
    image: docker.io/binwiederhier/ntfy:v2.38.1
    command: ['serve']
    environment:
        NTFY_BASE_URL: 'https://ntfy.example.com'
        NTFY_CACHE_FILE: '/var/cache/ntfy/cache.db'
        # Behind a reverse proxy: take the visitor's address from its header, or every client is the proxy.
        NTFY_BEHIND_PROXY: 'true'
        # iOS only: Apple lets nobody but ntfy.sh's own server push to a phone. This forwards just a poll
        # request (the topic hash, not the message) to it, so the phone wakes up and fetches from yours.
        NTFY_UPSTREAM_BASE_URL: 'https://ntfy.sh'
        # Deny by default, then grant the alerts topic to one user: `ntfy user add`, `ntfy access`, `ntfy token add`.
        NTFY_AUTH_FILE: '/var/lib/ntfy/auth.db'
        NTFY_AUTH_DEFAULT_ACCESS: 'deny-all'
    volumes:
        - ntfy-cache:/var/cache/ntfy
        - ntfy-auth:/var/lib/ntfy
```

Put TLS in front of it (the same reverse proxy as the API). Install the ntfy app on the phone, point it at the server
and subscribe to the topic. On Android, allow the app to override Do Not Disturb for urgent messages.

#### Telegram {#phone-push-telegram}

1. Create a bot with `@BotFather` (`/newbot`) and keep its token: `ALERT_TELEGRAM_BOT_TOKEN`
   (production: the `alert_telegram_bot_token` file).
2. Send the bot any message from the chat that should receive the alerts, then read the chat id from
   `https://api.telegram.org/bot<token>/getUpdates` (`message.chat.id`): `ALERT_TELEGRAM_CHAT_ID`. A group's id is negative.

The message is Alertmanager's default text. A bot token is a credential: if it leaks, revoke it in `@BotFather`
(`/revoke`) and set the new one.

#### Pushover {#phone-push-pushover}

Register an application in the Pushover account for the **application token** (`ALERT_PUSHOVER_TOKEN`) and copy the
**user key** from the account page (`ALERT_PUSHOVER_USER_KEY`); production uses the `alert_pushover_token` and
`alert_pushover_user_key` files. While an alert is firing the message is priority 2 (emergency): it repeats every
5 minutes until someone acknowledges it in the app, and stops after an hour. Its resolution is an ordinary message.

### The push drill {#phone-push-drill}

Proves a critical alert reaches a phone-side receiver. On the local stack ntfy needs no phone: subscribe with `curl`.

1. `npm run compose -- --profile observability up -d alertmanager ntfy`
2. Fire a critical alert by hand:
   `npm run compose -- exec alertmanager amtool --alertmanager.url=http://localhost:9093 alert add PushDrill severity=critical`
3. After the 30 s grouping wait, read the topic:
   `curl -s 'http://localhost:3073/boilerplate-alerts/json?poll=1'`: a JSON line whose `title` names `PushDrill`.
4. With Telegram set in `.env`, the same alert also arrives in the chat; with Pushover, on the phone.

On a staging stack, use your own topic and repeat the drill from the phone: an alert nobody has seen buzz is not known to work.

### The local drill

Proves the whole chain on your machine: a rule fires, Alertmanager routes it, a mail arrives. (The phone push has [its own drill](#phone-push-drill).)
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

See [Observability Endpoints](../reference/observability.md) for the full list. Key routes:

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
- **Alertmanager** — Prometheus evaluates the rules in `docker/observability/prometheus.alert-rules.yaml` and pushes firing alerts to Alertmanager, which groups and routes them to notification receivers. The receivers are chosen by the `ALERT_*` knobs; locally the email route defaults to mailpit, and a knob set to empty switches its route off (to `null`, no notification). Both share the same [Observability Reference](./observability-reference.md) config tables.

## External references

- [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/) — needed to write queries in [Grafana](./grafana.md)'s Prometheus Explore view

## Read next

- [Observability Reference](./observability-reference.md)
- [Grafana](./grafana.md)
- [Tempo](./tempo.md)
- [OpenTelemetry](./opentelemetry.md)
