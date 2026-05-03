# Product Analytics (PostHog)

> **TL;DR** — Business events (signup, login, product view, cart, checkout) are captured and sent to PostHog. Completely opt-in: set two env vars to activate; the app behaves identically without them.

---

## What is product analytics?

Product analytics answers **"what are users doing in your product?"**

| Observability signal | Answers                              |
| -------------------- | ------------------------------------ |
| Logs                 | What happened technically?           |
| Metrics              | How is the system performing?        |
| Traces               | Where did the request spend time?    |
| **Product events**   | **What did the user do / achieve?**  |

---

## Quick-start

### 1. Set env vars

```env
NODE_POSTHOG_API_KEY=phc_your_project_api_key_here
NODE_POSTHOG_HOST=https://app.posthog.com   # or your self-hosted URL
```

Leave both unset → analytics are silently disabled. No crashes, no errors.

### 2. Events flow automatically

Once the env vars are set every instrumented endpoint starts sending events to PostHog. No code changes needed.

### 3. Emit a custom event

```ts
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';

emitAnalyticsEvent({
    distinctId: req.user?.id ?? 'anonymous',
    event: AnalyticsEvent.PRODUCT_VIEWED,
    traceId: req.traceContext?.traceId,      // optional — links to OTel trace
    properties: { product_id: '64a...' },
});
```

---

## Architecture

```text
Controller
    │
    ├─── emitAnalyticsEvent() ──► isPostHogEnabled()?
    │                                    │ yes
    │                              getClient() (lazy singleton)
    │                                    │
    │                              PostHog.capture()
    │                                    │
    │                              ┌─────┴──────┐
    │                              ▼            ▼
    │                         PostHog Cloud  Self-hosted
    │
    └─── (continues normally, no await)
```

- **Fire-and-forget**: `capture()` is non-blocking. The PostHog SDK buffers events internally and flushes in the background.
- **Graceful shutdown**: `shutdownAnalytics()` is called in `stopServer()` to drain the buffer before the process exits.

---

## Configuration

| Env var                  | Required | Default                     | Description                                   |
| ------------------------ | -------- | --------------------------- | --------------------------------------------- |
| `NODE_POSTHOG_API_KEY`   | ✅ (to enable) | —                   | PostHog project write key                     |
| `NODE_POSTHOG_HOST`      | ✅ (to enable) | —                   | PostHog ingest base URL                       |

Both must be set; either missing → analytics silently disabled.

---

## Event taxonomy

### Auth / Onboarding

| Event              | `distinctId`   | Key properties         | Emitted in                              |
| ------------------ | -------------- | ---------------------- | --------------------------------------- |
| `user_signed_up`   | new user ID    | —                      | `POST /account/signup` (success)        |
| `user_logged_in`   | user ID        | `role`                 | `POST /account/login` (success)         |

### Product discovery

| Event                | `distinctId`          | Key properties                          | Emitted in                      |
| -------------------- | --------------------- | --------------------------------------- | ------------------------------- |
| `products_searched`  | user ID / `anonymous` | `text`, `page`, `pageSize`, `result_count` | `GET /products`, `POST /products/search` |
| `product_viewed`     | user ID / `anonymous` | `product_id`                            | `GET /products/:id`             |

### Cart

| Event                | `distinctId` | Key properties                 | Emitted in                    |
| -------------------- | ------------ | ------------------------------ | ----------------------------- |
| `cart_item_added`    | user ID      | `product_id`, `quantity`       | `POST /cart`                  |
| `cart_item_updated`  | user ID      | `product_id`, `quantity`       | `PUT /cart/:productId`        |
| `cart_item_removed`  | user ID      | `product_id`                   | `DELETE /cart/:productId`     |
| `cart_cleared`       | user ID      | `product_id` (if partial)      | `DELETE /cart`                |

### Checkout / Orders

| Event                 | `distinctId` | Key properties          | Emitted in            |
| --------------------- | ------------ | ----------------------- | --------------------- |
| `checkout_completed`  | user ID      | `order_id`              | `POST /cart/checkout` |
| `checkout_failed`     | user ID      | `reason`                | `POST /cart/checkout` |
| `order_created`       | user ID      | `order_id`              | `POST /orders` (admin)|

Every event also carries `trace_id` when available so you can jump from a PostHog funnel step straight to the matching Grafana Tempo trace.

---

## Sample event payload

PostHog receives:

```json
{
    "event": "checkout_completed",
    "distinct_id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "timestamp": "2024-01-15T14:22:05.000Z",
    "properties": {
        "order_id": "64b2c3d4e5f6a7b8c9d0e1f2",
        "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
        "$lib": "posthog-node",
        "$lib_version": "5.x"
    }
}
```

---

## Sample PostHog funnels

### Sign-up → First purchase funnel

```text
user_signed_up
    ↓
user_logged_in
    ↓
products_searched
    ↓
product_viewed
    ↓
cart_item_added
    ↓
checkout_completed   ← conversion goal
```

Build this in PostHog: **Insights → Funnels → Add steps in order above**.

### Cart abandonment

```text
cart_item_added
    ↓
checkout_completed  ← drop-off here = abandonment
```

Filter by time window (e.g. 7 days) to see abandonment rate.

---

## Adding a new event

1. Add a constant to the `AnalyticsEvent` enum in `src/utils/analytics.ts`.
2. Import `emitAnalyticsEvent` and `AnalyticsEvent` at the call site.
3. Call `emitAnalyticsEvent()` with a populated `IAnalyticsEvent`.
4. Add the event to the taxonomy table in this doc.

```ts
// src/utils/analytics.ts — add to enum
WISHLIST_ITEM_ADDED = 'wishlist_item_added',

// controller call site
emitAnalyticsEvent({
    distinctId: req.user!.id,
    event: AnalyticsEvent.WISHLIST_ITEM_ADDED,
    traceId: req.traceContext?.traceId,
    properties: { product_id: productId },
});
```

---

## IAnalyticsEvent schema

| Field          | Type                  | Required | Description                                       |
| -------------- | --------------------- | -------- | ------------------------------------------------- |
| `distinctId`   | `string`              | ✅        | PostHog user identity (user ID or `'anonymous'`)  |
| `event`        | `AnalyticsEvent`      | ✅        | Event name from the enum                          |
| `timestamp`    | `Date`                | —        | Event time; defaults to now                       |
| `traceId`      | `string`              | —        | OTel trace ID for cross-signal correlation        |
| `properties`   | `Record<string, unknown>` | —    | Domain-specific payload fields                    |

---

## Graceful shutdown

`shutdownAnalytics()` is called in `stopServer()` (inside `src/app.ts`). It flushes any buffered events before the process terminates, so no events are lost on deploy/restart.

---

## Related docs

- [Audit Logging](./audit-logging.md) — security/admin events
- [Prometheus Metrics](./prometheus-metrics.md) — numeric counters for the same business flows
- [OpenTelemetry Tracing](./opentelemetry-tracing.md) — per-request distributed traces
