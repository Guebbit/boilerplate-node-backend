---
source: tests/cross-cutting/proxy-overlay.test.ts
sha256: 8aeb0b1431d9752992a7cd684b56d781ba176feb9ba97c20d548af3390830a25
generated_at: 2026-11-08T09:30:24.987364+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/proxy-overlay.test.ts

## Purpose

A security-guard test that parses `docker-compose.proxy.yml` on every push and asserts five specific, reasoned decisions about the shared Traefik overlay: no Docker-socket mount, routes via file provider only, port 80 as a pure HTTPS redirect, a default of one trusted proxy hop for the app, and a per-client network alias with no routing labels. It exists because the overlay is the single container facing the internet, making its mount and routing configuration a security property of one file.

## Key elements

- **`Overlay`** – local interface describing the subset of compose services this file reads (`command`, `volumes`, `labels`, `environment`, `networks`).
- **`isOverlay`** – type guard narrowing the unknown result of `yaml.parse` to `Overlay`.
- **`parsed`** – the top-level parsed `docker-compose.proxy.yml` (with `merge: true` for YAML merge keys); throws immediately if the file doesn't resolve to an object with a `services` key.
- **Five `it` blocks** inside `describe('the Traefik overlay')`:
  - No `docker.sock` volume and no `--providers.docker`; routes come from `--providers.file.directory=/etc/traefik/dynamic`.
  - The only host-relative mount is `./traefik/dynamic:/etc/traefik/dynamic:ro`; the `clients/` directory is never exposed.
  - Port 80 (`web` entrypoint) only redirects to `websecure` over HTTPS.
  - `app` service sets `NODE_TRUST_PROXY_HOPS=${NODE_TRUST_PROXY_HOPS:-1}`, defaulting to one hop but allowing a per-client override.
  - `app` is reachable on the `proxy` network solely via the alias `${COMPOSE_PROJECT_NAME:?…}-app` and carries no Traefik routing labels.

## Relationships

- **`tests/support/paths.ts`** – imports `REPO_ROOT`, which this file uses to locate `docker-compose.proxy.yml` relative to the repository root regardless of the working directory the test runner launches from.

## Notes

- `yaml` is called with `logLevel: 'error'` to suppress the library's warning about Compose's `!reset` tag (it still parses `!reset` as an empty list correctly).
- The `:?` in `COMPOSE_PROJECT_NAME` means the compose file itself will abort at runtime if the variable is unset; the test simply asserts that the alias pattern exists, not that the variable is set.
- The test is deliberately narrow — it checks the five security decisions, not an exhaustive inventory of every key in the overlay. Adding a new key to the overlay does not require updating this file unless it touches one of those five decisions.
