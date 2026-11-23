---
source: src/infrastructure/http/middlewares/connection-close.ts
source_sha256: b5490fd7159584aa10c4d5d275f616299fb834453135ab3c15856e8dc2c1554c
context_sha256: 61714c1b60f42953c0e9ca094e0a204cc956fd094ba3114f248ef3f249843213
generated_at: 2026-11-22T02:49:02.147741+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/connection-close.ts

## Purpose
Express middleware that, once the server is draining for shutdown, makes every response carry `Connection: close`. Node keeps a connection alive on a response already in flight when `server.close()` runs, so a pooled client (e.g. a load balancer's upstream pool) could reuse a socket that is about to be cut. Telling the client to close makes it open a fresh connection, which a load balancer can route to another instance. See `docs/operate/health-checks.md#shutting-down-behind-a-load-balancer`.

## Key elements
- `closeWhileDraining(_request, response, next)`: the only export. It wraps `response.writeHead` and then calls `next()`.
  - The wrapper checks `isServerDraining()` when the head is written, not when the request arrived. A slow request that began before the shutdown signal therefore still gets `Connection: close`.
  - If draining, it calls `response.setHeader('Connection', 'close')`, then forwards the original arguments to the real `writeHead`.
  - `res.send` and `res.end` reach the head through `writeHead`, so they are covered.
  - It overwrites a `Connection` header set earlier, such as the `keep-alive` set when an SSE stream opens.

## Relationships
- `src/infrastructure/runtime/readiness.ts`: provides `isServerDraining()`, the drain-state check read on each `writeHead` call.
- `src/app.ts`: not shown in the file. The doc comment says this middleware must be first in the stack, so a refusal from any later middleware also carries the header.
- `tests/unit/infrastructure/http/middlewares/connection-close.test.ts`: unit tests for this middleware.

## Notes
- It is wrapped by hand instead of using `on-headers`, which is not a dependency. The file says `dropUnownedValidators` takes the same approach.
- `writeHead` has several overloads, so the wrapper uses rest args and is cast to `Response['writeHead']`. It forwards its arguments untouched.
- It has no effect while the server is not draining.
