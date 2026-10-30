---
source: tests/cross-cutting/security-headers-conformance.test.ts
sha256: 4494a4322b7e26a5da1007e79d016ee745af5314b6b8ad1b95d1c6806983d816
generated_at: 2026-10-29T06:49:58.638505+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/security-headers-conformance.test.ts

## Purpose

Conformance test verifying that the `installSecurity` Express middleware emits the exact set of security headers specified in the shared YAML case file (`shared/cases/security-headers.cases.yaml`). It exists to keep the Node/Express implementation in lockstep with its PHP twin by asserting header presence, absence, and exact values against a common source of truth.

## Key elements

- **`headerCase`** — Zod schema extending `caseBase` with three fields: `header` (the header name to check), `value` (expected exact value, optional), and `absent` (boolean flag meaning the header must not be present).
- **`answerHeaders()`** — Builds a bare Express app, calls `installSecurity(app)`, adds a single `/probe` GET route, issues a request via `supertest`, and returns the response `headers` object. No other middleware or routes are registered.
- **`describeCases('security-headers', headerCase, 14, …)`** — Drives 14 cases from the shared YAML file. For each case it lowercases the header name, then asserts either `undefined` (when `absent` is true) or strict equality with `value`.

## Relationships

- **`src/app/security.ts`** — Source of `installSecurity`, the middleware under test. The test calls it directly on a bare Express instance; no application-level routes or other middleware intervene.
- **`tests/support/cases.ts`** — Provides `caseBase` (the base Zod schema all shared case files build on) and `describeCases` (the runner that loads the YAML file, validates each entry against the schema, and produces one `it` block per case).

## Notes

- The test deliberately mounts the middleware on a *naked* Express app so that any header observed is attributable solely to `installSecurity`; a full app router could add or suppress headers and mask regressions.
- Header lookup is case-insensitive (`one.header.toLowerCase()`) because `supertest`/Node normalise response header names to lowercase.
- The expected case count (`14`) is passed as a literal; if the YAML file grows or shrinks, this number must be updated in lockstep or the runner will error.
- The file is part of a cross-language conformance suite (referenced "PHP twin"), so the YAML case file is the contract both implementations must satisfy.
