---
source: scenarios/flows/client.ts
sha256: 22907c3de7465af013ade2e4c4874c524e9f603ff8b0a390531c9b40d44858bf
generated_at: 2026-10-14T06:57:49.933617+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/client.ts

## Purpose

A thin HTTP client that the scenario flow runner uses to drive the running application over a single base URL and bearer token. It exists so every flow file can make authenticated requests without repeating envelope-unwrap logic, and it deliberately uses the runtime's native `fetch` (not supertest) because it executes at container boot where devDependencies may be absent.

## Key elements

- **`Attempt`** (exported interface) — Normalised shape of any API response: `status`, `data` (from the envelope), `errorCode`, and `errorMessages`.
- **`ScenarioFlowError`** (exported class) — The sole error type thrown by a failed `call`; embeds the actor's email, method, path, status, and error payload in its message.
- **`Caller`** (exported interface) — A signed-in actor with two methods: `call` (throws on non-2xx, returns typed `data`) and `attempt` (never throws, returns the raw `Attempt` for flows that *expect* a refusal).
- **`signIn`** (exported function) — Authenticates via `POST /account/login` with `{ email, password, transport: 'bearer' }`, extracts a token (handles both `token` and `sessionToken` response fields), and returns a `Caller` bound to that token.
- **`send`** (internal) — The single `fetch` call site; serialises JSON bodies, strips `content-type` for `FormData` multipart uploads, and pipes the response through `readAttempt`.
- **`readAttempt`** (internal) — Parses the API's `{ data, errors[] }` envelope into an `Attempt`; tolerates 204 / non-JSON bodies.

## Relationships

- **`scenarios/flows/actions.ts`** and **`scenarios/flows/shop-history.ts`** — Sibling flow modules that import `signIn` / `Caller` to script their respective scenario steps against a live server.
- **`scenarios/shop-modules.ts`** — Defines the shop-module catalogue that the flows (and this client's `PATCH` verb, noted as the products module's update shape) exercise.
- **`scenarios/locales.ts`** — Provides locale data consumed during scenario setup; this client's requests are the transport through which that data is applied.
- **`scripts/docs/generate-role-matrix.ts`** — Reads the scenario flow files (including this module's `Caller` usage) to generate the role/permission matrix documentation.
- **`src/modules/cart/tests/integration/checkout-rate-limit.test.ts`** — Integration test that exercises the same checkout endpoints the scenario flows hit; shares the envelope/error-code conventions this client decodes.

## Notes

- `signIn` must go through the real login endpoint (not a hand-signed JWT) so that the session is **fresh**; `requireFreshAuth('critical')` on checkout and payment routes will reject stale tokens.
- The `body` parameter accepts `FormData` in addition to plain objects; the `content-type` header is intentionally dropped for `FormData` so `fetch` can set the multipart boundary itself.
- `call` is generic (`<T>`) but the cast is unchecked — flows are responsible for requesting the right shape. `attempt` always returns `data: unknown`.
- The `Method` type includes `PATCH` specifically for the products module; there is no `HEAD` or `OPTIONS`.
