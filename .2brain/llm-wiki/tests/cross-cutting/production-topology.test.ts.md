---
source: tests/cross-cutting/production-topology.test.ts
sha256: c6ff54bdbaf80b865a9a30ab6ff8db8790b34083ee35d47884ddab1f1d4f5edf
generated_at: 2026-09-23T19:58:51.373659+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/production-topology.test.ts

## Purpose

Asserts four production-security properties that no other gate (type-check, lint, unit tests) would catch: read-only hardened containers, no data-port publishing, no surviving `--inspect` debugger, and no lifecycle-script execution during image build. It reads `docker-compose.production.yml` and `docker/Dockerfile.production` from disk on every push so that the checks survive refactors that preserve behavior but not the reviewer's one-time attention.

## Key elements

- **`PortMapping`** — Union type for a compose `ports:` entry (short string `"127.0.0.1:3000:3000"` or long mapping with `host_ip`/`published`).
- **`ComposeFile`** / **`isComposeFile`** — Narrow structural interface and type-guard for the subset of the YAML this file actually reads (per-service `read_only`, `cap_drop`, `security_opt`, `ports`, `environment`, `command`).
- **`parsedCompose`** — The production compose file parsed with `{ merge: true }` so `<<: *hardening` anchors are resolved. Throws at import time if the top-level shape is wrong.
- **`dockerfile`** — Raw text of `docker/Dockerfile.production`, used for substring/regex assertions.
- **`OWN_CODE_SERVICES`** (`app`, `cron`, `setup`) and **`BACKING_SERVICES`** (`database`, `cache`, `queue`) — The two groups the test reasons about; own-code services share one image and hardening block, backing services must never be host-reachable.
- **`hostInterfaceOf`** — Extracts the bound interface from either spelling of a port mapping; `undefined` means "all interfaces."
- **Four `describe` blocks** — Each maps one security decision to one or two focused `it` assertions (hardening flags, port binding, debugger absence, `npm ci --ignore-scripts`).

## Relationships

No graph neighbors; the file is a leaf that only reads two deployment artifacts from disk.

## Notes

- **`merge: true` is load-bearing.** Without it the `yaml` parser leaves `<<` as a literal key, every service appears to have no hardening, and the suite goes red on a YAML refactor that changed nothing about the deployment.
- **Deliberately narrow.** The test asserts the four properties it was written for, not a full key census of the compose file, so a legitimate addition (a new service, an extra env var) does not break the gate.
- **`--inspect` check reads raw text**, not the parsed object, so anchors, `command:` overrides, and `NODE_OPTIONS` env-file defaults are all covered by a single regex.
- **`npm ci` check strips comment lines** before matching because the Dockerfile documents its own `npm ci` choice in prose; a comment is not an install step.
- **Port-binding test is non-vacuous.** It first asserts that `app` appears among published ports, then checks every published port binds `127.0.0.1`. A deployment that publishes nothing would pass the binding check but fail the existence check.
