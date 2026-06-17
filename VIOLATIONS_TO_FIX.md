# Violations To Fix

Code-review findings from the `openapi-typescript-codegen → orval` migration. Ranked most-severe first.

---

## 1. [HIGH] Missing `Content-Type: application/json` on union-type mutation endpoints

**File:** `api/index.ts` — lines 677, 1150, 1216, 1420, 1874, 1945, 2139

**Functions affected:** `signup`, `createUser`, `updateUser`, `updateUserById`, `createProduct`, `updateProduct`, `updateProductById`

**Problem:** These endpoints accept a `Request | RequestMultipart` union, so orval intentionally skips the `Content-Type` header (to avoid hardcoding `application/json` for what might be a multipart call). Side-effect: when the JSON variant is used without manually setting the header, `fetch()` sends the body as `text/plain;charset=UTF-8`. Express's `json()` middleware ignores non-`application/json` bodies → `req.body = {}`.

JSON-only endpoints (e.g. `confirmAccountDelete` at line 560) correctly set `headers: { 'Content-Type': 'application/json', ...options?.headers }` — this is an inconsistency in the generated output.

**Fix direction:** Caller must explicitly pass `options.headers['Content-Type'] = 'application/json'` for the JSON variant, OR orval config needs a custom mutator/transformer that injects the header based on the body type. Alternatively, split union endpoints into two generated functions (one JSON, one multipart).

---

## 2. [HIGH] Multipart `Blob`/`File` fields silently dropped by `JSON.stringify()`

**File:** `api/index.ts` — lines 679, 1152, 1218, 1422, 1876, 1947, 2141

**Functions affected:** same set as #1

**Problem:** Every body-bearing endpoint calls `body: JSON.stringify(body)` unconditionally, even when the argument is the `*Multipart` variant (e.g. `SignupRequestMultipart` which has `imageUpload?: Blob`). `JSON.stringify({imageUpload: blob})` serializes the `Blob` as `{}` — the file is silently lost. No error is thrown.

**Fix direction:** Branch on `body instanceof FormData`: if true, pass it directly without `JSON.stringify` (and do not set `Content-Type` so the browser sets the multipart boundary automatically); otherwise JSON-stringify and set `Content-Type: application/json`.

---

## 3. [MEDIUM] `getObservabilityEvents()` blocks on `await res.text()` for a live SSE stream

**File:** `api/index.ts` — line 157

**Problem:** The `/observability/events` endpoint is a long-lived Server-Sent Events stream. The generated function calls `await res.text()`, which reads the entire response body before resolving. Because the server keeps the connection open (sending periodic events and heartbeats), the `Promise` never resolves during the session. When the connection eventually drops, it resolves with the entire raw SSE text as one string — not individual parsed events.

**Fix direction:** SSE cannot be consumed via `res.text()`. The consumer needs to read `res.body` as a `ReadableStream` (browser) or use `EventSource`. The orval-generated function is fundamentally wrong for this endpoint type. Consider excluding this endpoint from code generation and writing a hand-rolled `EventSource` wrapper instead.

---

## 4. [MEDIUM] Null query params serialized as the literal string `"null"`

**File:** `api/index.ts` — lines 377, 1066, 1476, 1790, 2190, 2728

**Problem:** The URL builder iterates params and skips `undefined`, but passes `null` through as `value === null ? 'null' : String(value)`. If a caller passes `{ status: null }`, the URL becomes `/users?status=null`. The server receives the string `"null"` for a filter param instead of the param being absent, causing incorrect query behavior (validation error or no results).

**Fix direction:** Treat `null` the same as `undefined` — skip it. Change the condition to `if (value !== undefined && value !== null)`.

---

## 5. [MEDIUM] Docker Promtail log collection broken for existing users without `.env` update

**File:** `docker-compose.yml` — lines 196–197 (removed volume mount)

**Problem:** The `/var/lib/docker/containers` volume was removed from the base `docker-compose.yml` and moved into the new `docker-compose.docker.yml` override. Activating it now requires `COMPOSE_FILE=docker-compose.yml:docker-compose.docker.yml` in `.env`. Existing Docker users who pull this change without updating `.env` will have Promtail running with its config but no log directory to tail — log collection silently stops, no error is raised, Loki/Grafana show no new log entries.

**Fix direction:** Add a prominent migration note to the project README or CHANGELOG. Consider also adding a comment inside `docker-compose.yml` near the promtail service pointing to the override files.

---

## 6. [LOW] Stale comment + local multipart type definitions now shadow the orval-generated ones

**File:** `src/types/index.ts` — lines 23–30

**Problem:**
- The comment `// openapi doesn't generate multipart/form-data types` is now false — orval generates `SignupRequestMultipart`, `CreateUserRequestMultipart`, etc. in `api/models/`.
- `src/types/index.ts` does `export * from '@api/models'` (which re-exports those generated types), then immediately redefines them locally as `WithFileUpload<BaseType>` (using `File | Buffer` for `imageUpload`). TypeScript silently lets the local definitions shadow the re-export.
- Two divergent shapes for the same names now coexist: imports via `@types` get `File | Buffer`; imports directly via `@api/models` get `Blob`.

**Fix direction:** Now that orval generates the multipart types, remove the local `WithFileUpload<>` definitions from `src/types/index.ts` and update the comment. If `File | Buffer` is needed server-side (Node.js context), augment the generated type rather than shadowing it.

---

## 7. [LOW] Empty 200 response body yields `{}` cast to a typed envelope (type lie)

**File:** `api/index.ts` — line 686 (and same pattern at lines 220, 266, 329, 404, 455, 511, 567, …)

**Problem:** Every endpoint uses `body ? JSON.parse(body) : {}` as the fallback. If the server returns HTTP 200 with an empty body, `res.text()` resolves to `""` (falsy), so `data = {}`. The function then casts it `as getXxxResponse` which claims `data: SomeEnvelope`. Callers that read `response.data.someField` get `undefined` instead of a compile-time error; the `as`-cast suppresses the type mismatch.

**Fix direction:** Use `null` as the fallback (`body ? JSON.parse(body) : null`) and update the return types to reflect that `data` can be `null` for empty responses. This surfaces the issue at the type level rather than hiding it.