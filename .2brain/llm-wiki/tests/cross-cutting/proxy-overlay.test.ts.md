---
source: tests/cross-cutting/proxy-overlay.test.ts
sha256: 8aeb0b1431d9752992a7cd684b56d781ba176feb9ba97c20d548af3390830a25
generated_at: 2026-10-29T06:48:45.929425+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/proxy-overlay.test.ts

## Purpose

Cross-cutting guard that asserts five security invariants on the shared Traefik overlay (`docker-compose.proxy.yml`). Because that overlay is the single container facing the internet, its mounts, entrypoint configuration, and client-identification strategy are a security property of one file; this test re-checks those decisions on every push rather than relying on review memory.

## Key elements

- **`Overlay`** (interface) — Minimal structural type for the compose file's `services` map, narrowing only the fields the tests actually read (`command`, `volumes`, `labels`, `environment`, `networks`).
- **`isOverlay`** (type guard) — Checks that the `yaml.parse` result is a non-null object with a `services` key; throws at module load if the file fails to parse into that shape.
- **`parsed`** (module-level const) — The overlay parsed with `merge: true` (applies compose `<<:` merge keys) and `logLevel: 'error'` (silences the spurious `!reset`-tag warning).
- **Five `it` assertions:**
  1. No Docker socket mount and no `--providers.docker`; routes come from `--providers.file.directory=/etc/traefik/dynamic` with `watch=true`.
  2. Exactly one host volume (`./traefik/dynamic:…:ro`); the `clients/` directory is never mounted.
  3. Port 80 is a pure HTTPS redirect (`entrypoint.to=websecure`, `scheme=https`) and nothing else.
  4. `NODE_TRUST_PROXY_HOPS` defaults to `1` via `${NODE_TRUST_PROXY_HOPS:-1}` so a per-client env file can override.
  5. The app's network alias is `${COMPOSE_PROJECT_NAME:?…}-app` (per-client unique) and the app carries **no** Traefik routing labels.

## Relationships

- **`tests/support/paths.ts`** — Provides `REPO_ROOT`, which this file joins with `docker-compose.proxy.yml` to locate the overlay relative to the repository root regardless of the test runner's working directory.

## Notes

- The test is deliberately **narrow**: it checks only the five reasoned-about security decisions, not an exhaustive key inventory. Adding new invariants to the overlay is a separate concern.
- Assertions use `expect(traefik?.command?.join('\n')).not.toMatch(/…/) ` style for negative checks because the `command` array is order-agnostic; positive checks use `toContain` / `toEqual(expect.arrayContaining([…]))` for the same reason.
- The `logLevel: 'error'` option on `yaml.parse` is load-bearing: without it, the `!reset` tag in the compose file emits a warning that would pollute CI output, even though the tag is parsed correctly as an empty list.
- The file throws at **module load time** (top-level `if (!isOverlay(parsed)) throw …`) rather than inside a test, so a malformed compose file fails the entire suite immediately with a clear message rather than surfacing as a confusing assertion error.
