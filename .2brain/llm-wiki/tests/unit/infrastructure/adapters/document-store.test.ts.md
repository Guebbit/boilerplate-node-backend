---
source: tests/unit/infrastructure/adapters/document-store.test.ts
sha256: 552733747a7d39e0f02f73a779ae084c3358a7268ae0ac25326a87922c3e3da8
generated_at: 2026-11-08T10:06:03.620446+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/document-store.test.ts

## Purpose

Unit tests for the document-store adapter that verify its observable disk contract: byte round-trip, atomic writes with no stray temp files, strict name-shape validation (rejecting path traversal, wrong extensions, oversized names), and age-based reaping. Each test runs against a real temp directory so the assertions target actual filesystem state.

## Key elements

- **`beforeEach` / `afterEach`** — Creates a `mkdtemp` directory, points `NODE_DOCUMENT_STORE_PATH` at it via `setEnvironment`, and removes the tree after each test.
- **`describe('readDocument and writeDocument')`** — Covers round-trip fidelity, `undefined` for missing docs, auto-creation of the store directory on first write, atomic concurrent writes (no leftover temp files), and parameterised name-rejection (`it.each` over path-traversal, subdirectory, non-PDF, empty, >90-char, and URL-encoded names).
- **`age(name, days)`** (local helper) — Backdates a file's mtime with `fs/promises.utimes` so reaping tests avoid clock-mocking.
- **`describe('reapDocuments')`** — Confirms files past the window are deleted while in-window files survive; returns `{ checked, reaped }` counts; no-ops safely when the store directory is absent.
- **`describe('removeDocument')`** — Single-file deletion, `false` for absent files, and `false` (no path touched) for invalid names.

## Relationships

- **`src/infrastructure/adapters/document-store.ts`** — The module under test; this file imports `readDocument`, `writeDocument`, `removeDocument`, and `reapDocuments` and asserts their return values and side-effects on disk.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, called in `beforeEach` to point the adapter at the per-test temp directory.

## Notes

- Despite living under `tests/unit/`, the tests create and inspect real files in a temp directory — they are effectively filesystem-level integration tests scoped to a single adapter.
- Name-validation tests assert both that no read/write side-effect occurs *and* that the directory listing stays empty, guarding against partial path construction.
- The concurrent-write test relies on the adapter's atomic-write strategy (write-to-temp-then-rename) to guarantee no intermediate file is visible after `Promise.all` resolves.
