# docs/tools/analytics.md

## Purpose

Documents the Node backend's product-analytics pipeline: how business-level events (signup, cart, checkout, order) are emitted through a single helper, routed to a configurable provider (Umami, PostHog, or no-op), consent-gated, and named. It exists to centralise the conventions so that no module needs to know where an event lands, and to record the deliberate differences from the PHP twin's ambient-context approach.

## Key elements

- **`emitAnalyticsEvent()`** — The one choke-point every module calls to emit. Applies the consent gate, serialises to the active provider, and is the only place consent is checked.
- **`CallerContext` / `callerContextOf(request)`** (in `src/infrastructure/http/request.ts`) — Plain-parameter carrier for IP, user-agent, trace id, and `analyticsConsent`. Built once in the controller; passed down to the emitting service call. Deliberately *not* an `AsyncLocalStorage` ambient read (unlike the PHP twin).
- **`NODE_ANALYTICS_PROVIDER`** — Selects `umami` (default), `posthog`, or `none`. Unknown values throw on first event. Mirrors the `NODE_PAYMENT_PROVIDER` port pattern.
- **`NODE_ANALYTICS_REQUIRE_CONSENT`** — Defaults `true`. When set, only an explicit `granted` consent captures; everything else is dropped. No partial/anonymised capture exists by design.
- **`NODE_UMAMI_INGEST_HOST`** — Internal-network address the API dials for ingest. Distinct from the public `NODE_UMAMI_HOST` (browser-facing origin). Falls back to the public host if unset.
- **`src/modules/<name>/analytics.ts`** + **`declare module` / `AnalyticsEventMap`** — Per-module event-name definitions; the `declare module` block registers names in the global type map so the compiler catches typos.
- **`tests/cross-cutting/analytics-events.test.ts`** — Sweeps all module folders; fails on duplicate event names, duplicate constant names, or a missing `declare module` block.
- **`check:spec-identity`** — Guards that the event catalogue is byte-identical between the Node and PHP repos (the paired-frontend half is now empty by construction, so all custom names live here).
- **`GET /observability/health`** — Reports active provider as `telemetry.analytics: { provider, configured }`.

## Relationships

- **`docs/tools/prometheus.md`** — Complementary: Prometheus counts operational SLOs; analytics counts business funnels. The doc recommends adding a Prometheus counter alongside an analytics emit when you need a consent-independent count.
- **`docs/tools/tempo.md`** — Every analytics event carries a `traceId` that joins to the corresponding Tempo trace; the audit event in that trace names the actor, which is why "anonymised" partial capture is deliberately absent.
- **`docs/tools/events-and-logging.md`** — The audit trail inverts the analytics convention: audit puts `outcome` in a mandatory field and slices *across* actions; analytics uses separate event names (`checkout_completed` vs `checkout_failed`) and counts *per name*.
- **`docs/tools/observability-layer.md`** — The health endpoint's `telemetry.analytics` field is part of the broader observability surface documented there.
- **`docs/tools/pairing-and-ports.md`** — Provider selection follows the same port/adapter pattern as `NODE_PAYMENT_PROVIDER`; this file is a second worked example of that pattern.
- **`docs/modules/cart-checkout.md`** — Primary source of the canonical event names (`cart_viewed`, `cart_item_added`, `order_created`, `checkout_completed`, `checkout_failed`, `payment_succeeded`, `payment_declined`).
- **`docs/modules/wishlist.md`** — Emits `wishlist_item_added`; subject to the same naming and collision rules.
- **`docs/reference/src-infrastructure.md`** — Houses `CallerContext` and `callerContextOf` in `src/infrastructure/http/request.ts`.
- **`docs/reference/src-modules.md`** — Per-module `analytics.ts` files live alongside the module's service code.
- **`docs/reference/tests.md`** — Lists `tests/cross-cutting/analytics-events.test.ts` among cross-cutting test suites.
- **`docs/theory/index.md`** — The PHP-ambient-vs-Node-threaded context split is a deliberate architectural divergence discussed in the theory notes.
- **`docs/tools/frontend-observability.md`** — The frontend emits no custom events; its pageviews are handled by the Umami tag. All custom names in the shared Umami website originate in this repo.
- **`docs/tools/package-dependencies.md`** — Umami is a self-hosted compose service; PostHog is the one hosted/cloud dependency in the stack.

## Notes

- **Emit from the service, not the controller.** A route-level emit misses other routes that reach the same operation (e.g. admin order creation vs. customer checkout both create an order). The `order_created` bug was the motivating case for this rule.
- **Split ambiguous methods before adding an emit.** `cartGetForView` vs `cartGetForBadge` are separate functions so only the former emits `cart_viewed`. A boolean flag on a shared function is considered a footgun.
- **Consent is tri-state and opt-in.** `granted` / `denied` / unset (never asked). Only `granted` captures. There is no "anonymised" middle tier because `order_id`, `product_id`, and `traceId` would still join back to the person.
- **`NODE_ANALYTICS_REQUIRE_CONSENT` defaults `true`** (GDPR Art. 25(2)). A fresh deployment captures nothing until users grant. Set to `false` only after independent legal advice.
- **Naming is `<subject>_<past-tense-verb>`, singular subject = one instance, plural = collection, compound for nested things.** One noun per domain. Outcomes are separate event names, never a property.
- **Renames are destructive in Umami** (no history forward). Decide names before dashboards depend on them.
- **`NODE_UMAMI_INGEST_HOST` ≠ `NODE_UMAMI_HOST`.** The former is the internal network address the API container dials; the latter is the public browser-facing origin. Inside compose, `localhost` in the ingest host resolves to the API itself.
- **The two backends (Node vs PHP) are never deployed simultaneously**, so there is no cross-backend vocabulary diff test by design.
