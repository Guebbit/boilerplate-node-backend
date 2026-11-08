---
source: tests/cross-cutting/production-topology.test.ts
sha256: da7307687dc2c07831c5aef20e192ff74a048bf50384270dbf1d12e12eb052c6
generated_at: 2026-11-08T09:30:14.479711+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/production-topology.test.ts

## Purpose

Guards the security posture of the two production deployment artifacts — `docker-compose.production.yml` and `docker/Dockerfile.production` — by asserting specific, reasoned-about properties (read-only filesystems, dropped capabilities, no exposed data ports, bounded logs, no package-manager binaries, no debugger flags) that no other check in the gate would catch. It exists so the same "human review reading" runs on every push instead of relying on one reviewer's attention.

## Key elements

- **`isComposeFile`** — type guard narrowing `unknown` (the raw `yaml` parse result) to the local `ComposeFile` interface.
- **`parsedCompose` / `compose`** — the production compose file parsed with `{ merge: true }`, so YAML 1.1 merge keys (`<<: *hardening`) are resolved before assertions run.
- **`dockerfile`** — the full text of `docker/Dockerfile.production`, read once at module load.
- **`OWN_CODE_SERVICES`** — `['app', 'cron', 'setup']`; the three services that share this repo's image and hardening block.
- **`BACKING_SERVICES`** — `['database', 'cache', 'limits', 'queue', 'prometheus', 'alertmanager', 'loki', 'alloy']`; data stores and unauthenticated UI services that must not publish host ports.
- **`hostInterfaceOf(port)`** — extracts the bound host interface from either the short-string or long-mapping port spelling.
- **`describe` blocks** (one per security property): log bounding, read-only/cap-drop hardening for own-code services, cap-drop for data services, absence of published ports, explicit loopback binding, Mongo TLS flags, cron config-check-first, no package-manager in runtime stage, no `--inspect` debugger.

## Relationships

- **`tests/support/paths.ts`** — supplies `REPO_ROOT`, used to resolve the absolute paths of `docker-compose.production.yml` and `docker/Dockerfile.production` relative to the repository checkout.

## Notes

- `merge: true` in the `yaml.parse` call is **load-bearing**: without it, merge keys (`<<`) remain as a literal key and every service appears to have no hardening, causing false failures on a harmless refactor.
- The file is **deliberately narrow** — it asserts only the properties that were explicitly reasoned about in review, not a full census of the compose file. Adding a blanket "every key must equal X" assertion is discouraged because it fails on the next legitimate edit.
- Data-service hardening is intentionally weaker than own-code hardening (official images need `CHOWN`, `DAC_OVERRIDE`, etc. to `chown` their data directory at entrypoint); the test asserts the exact `cap_add` set rather than forbidding all capabilities.
- The `BACKING_SERVICES` list is a fixed tuple; adding a new backing service requires updating it here to avoid a vacuous pass.
- The file was truncated in the snapshot at the "production runs no debugger" block; additional assertions may follow in the full file.
