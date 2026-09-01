# docs/tools/analytics.md

## Purpose

Documents the server-side product-analytics pipeline: how business events (signup, cart, checkout, order, wishlist) are emitted through a single helper, routed to a configurable provider (Umami, PostHog, or no-op), and governed by a strict naming convention and cross-repo uniqueness guarantee. It exists so that "how many users abandon checkout?" is answerable without polluting operational metrics or per-request traces.

## Key elements

- **`emitAnalyticsEvent()`** — the single helper every module calls; no module knows where the event lands.
- **`NODE_ANALYTICS_PROVIDER`** — env var selecting `umami` (default), `posthog`, or `none`; mirrors the `NODE_PAYMENT_PROVIDER` port pattern.
- **`CallerContext`** / **`callerContextOf(request)`** (`src/infrastructure/http/request.ts`) — plain parameter threading caller IP, user-agent, and trace id into service calls; deliberately *not* an `AsyncLocalStorage` ambient value.
- **`src/modules/<name>/analytics.ts`** — per-module event declarations; each uses a `declare module` block to register names in `AnalyticsEventMap`. One module, one owner.
- **`tests/cross-cutting/analytics-events.test.ts`** — fails on duplicate event names, duplicate constant names, or missing `declare module` blocks across all module folders.
- **Naming rule** — `<subject>_<past-tense-verb>`, snake_case; outcomes are separate events (`checkout_completed` / `checkout_failed`), not a shared name plus an `outcome` property.
- **Provider implementations** — Umami (`POST /api/send`), PostHog (buffered `capture()`), and a no-op; unknown provider names throw on first event.
- **`check:spec-identity`** — guards that the backend and paired-frontend event catalogues are byte-identical (the frontend emits no custom events, so this is trivially satisfied).

## Relationships

- **`docs/modules/cart-checkout.md`** — primary emitter of `cart_viewed`, `cart_item_added`, `order_created`, `checkout_completed`/`checkout_failed`, `payment_succeeded`/`payment_declined`. The rule that `order_created` must fire from the service (not the admin-order controller) originated here.
- **`docs/modules/wishlist.md`** — emits `wishlist_item_added`; shares the `cartItemAdd` / `cartItemUpdateQuantity` split rule.
- **`docs/tools/events-and-logging.md`** — the audit-trail system; explicitly contrasted (outcome is a *field* in audit, a *different event name* in analytics).
- **`docs/tools/frontend-observability.md`** — the browser half writing pageviews into the same Umami website; the frontend emits no custom events.
- **`docs/tools/prometheus.md`** / **`docs/tools/tempo.md`** — the operational and per-request counterparts; analytics is explicitly the third, business-question lane.
- **`docs/tools/observability-layer.md`** / **`docs/tools/index.md`** — parent context; `GET /observability/health` reports `telemetry.analytics`.
- **`docs/reference/src-infrastructure.md`** — houses `CallerContext` and `callerContextOf`.
- **`docs/reference/src-modules.md`** — houses each module's `analytics.ts` file.
- **`docs/reference/tests.md`** — describes the cross-cutting analytics-events test.
- **`docs/tools/pairing-and-ports.md`** — the provider-port pattern that `NODE_ANALYTICS_PROVIDER` follows.
- **`docs/tools/package-dependencies.md`** — PostHog Node client dependency.

## Notes

- **`NODE_UMAMI_INGEST_HOST` ≠ `NODE_UMAMI_HOST`.** The former is the in-network API endpoint (compose: `http://umami:3000`); the latter is the public browser origin. Using the public one from inside a container dials `localhost`, i.e. the API itself.
- **Umami silently drops events with no `User-Agent` header** and still returns `200`. The provider always forwards the caller's UA or substitutes a server placeholder.
- **Renaming an event after deployment ends its time-series in Umami** — there is no history migration.
- **Split before emit:** a method serving two meanings (e.g. `cartGetForView` vs `cartGetForBadge`) must be two named functions, not one with a flag.
- **The two backends' (Node vs PHP) event vocabularies are not diffed against each other.** Deployment runs one backend at a time; a cross-repo gate would guard an impossible state. The rule is that both trees apply the same naming convention independently.
- **The PHP twin uses `AnalyticsContext::current()`** (ambient, safe under PHP-FPM); the Node twin threads a plain parameter. This is an intentional divergence, not an oversight.
