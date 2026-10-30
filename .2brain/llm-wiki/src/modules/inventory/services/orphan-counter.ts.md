---
source: src/modules/inventory/services/orphan-counter.ts
sha256: e0b67f8aa8fa0e6e5bf55e7ef2ac8f8455b729437ac78378e9553f94bd16c4f8
generated_at: 2026-10-29T04:04:04.435563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/orphan-counter.ts

## Purpose

Defines a single Prometheus counter — `inventory_commit_orphaned_total` — that counts paid or shipping orders found with no hold to settle. The file is intentionally split out from `../metrics.ts` so that importing holds (or the holds tests) does not drag in two gauge collectors that query the database on every scrape.

## Key elements

- **`inventoryCommitOrphanedTotal`** (exported `Counter`) — Labeled by `stage` (`'commit'` for payment, `'ship'` for dispatch). Each increment signals a human must intervene; the fix path differs by stage.
- **Zero-initialisation loop** — Immediately calls `.inc({ stage }, 0)` for both stages so the metric exists from process start, ensuring Prometheus `increase()` alerts fire on the first real orphan after a restart rather than silently seeing a missing series.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Imports `metricsRegistry` and passes it as the `registers` target so the counter lands on the shared registry rather than the default one.
- **`src/modules/inventory/services/holds.ts`** — The two label values (`'commit'`, `'ship'`) mirror the stages accepted by `raiseOrphanAlarm` in that file; this counter is the metric side of the same alert.
- **`src/modules/inventory/tests/integration/service.test.ts`** — The file's module doc comment states the separation exists specifically so this test (and any other test that imports holds) does not load the DB-querying gauges from `../metrics.ts`.

## Notes

- The `stage` label values are **not** derived from a shared enum; they are hard-coded here and in `holds.ts`. Keep them in sync manually if a new stage is added.
- `ship` fires only when no hold exists at all; `commit` also covers the case of a released hold that the shelf could not cover when payment landed. This asymmetry is intentional and documented in `docs/modules/inventory-reservations.md#orphaned-hold`.
- Because the counter is zero-initialised, the first real event will appear as an increase of 1 (not the raw value), which is what the alert rule expects.
