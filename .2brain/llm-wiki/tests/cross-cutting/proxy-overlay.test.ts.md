---
source: tests/cross-cutting/proxy-overlay.test.ts
sha256: e12245559d7cee276a80f61f011ee77c24973bdbb6fe7c599cb6d8b4b0713bb3
generated_at: 2026-11-14T23:06:27.846626+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/proxy-overlay.test.ts

## Purpose

A CI guard that parses `docker-compose.proxy.yml` on every run and asserts the five security-critical decisions of the shared Traefik overlay (the single container facing the internet): no Docker socket, file-based routes only, port 80 → HTTPS redirect, a trusted-hop default for the app, and a per-client network alias with no routing labels. It exists so that a careless edit to the overlay cannot silently expose a root-equivalent socket, leak client secrets, or break timeout ordering.

## Key elements

- **`Overlay`** (interface) — minimal shape of the parsed YAML's `services` map (command, volumes, labels, environment, networks).
- **`isOverlay`** (type guard) — narrows `unknown` from `yaml.parse` to `Overlay`.
- **`parsed`** — the overlay read from `docker-compose.proxy.yml` at module load with `merge: true`; throws if the top-level shape is not an object with `services`.
- **`flagMs(flag)`** — finds a `--<flag>=…s` entry in Traefik's `command` array and returns the value in milliseconds (or `NaN`).
- **`describe('the Traefik overlay', …)`** — six `it` blocks covering the five security decisions plus a check that `.env-example` does not ship a conflicting `NODE_TRUST_PROXY_HOPS`.

## Relationships

- **`src/app/config.ts`** — imports `appConfig()` to read the app's `NODE_HTTP_REQUEST_TIMEOUT_MS`, `NODE_HTTP_HEADERS_TIMEOUT_MS`, and `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS`, then asserts Traefik's `readTimeout` ≥ the app's total and its `idleConnTimeout` < the app's keep-alive.
- **`tests/support/paths.ts`** — imports `REPO_ROOT` to resolve `docker-compose.proxy.yml` and `.env-example` on disk.

## Notes

- The YAML is parsed with `merge: true` (Compose merge keys) and `logLevel: 'error'` to suppress a harmless warning about the `!reset` tag; the tag is still read correctly as an empty list.
- The timeout ordering test compares against values from `appConfig()`, so changing an app-side timeout without updating the overlay will fail CI.
- The `:-` syntax in `NODE_TRUST_PROXY_HOPS` means a client env file can still override the default; the separate `.env-example` check ensures the shipped template doesn't ship a `0` that would silently disable the hop.
- The test reads the raw YAML file via `readFileSync` rather than importing a pre-parsed object, so it catches syntax/structure regressions in the Compose file itself.
