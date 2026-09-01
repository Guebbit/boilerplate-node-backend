# src/modules/payments/providers/card.ts

## Purpose

Shared type and utility module for card data at the provider boundary. It exists as a standalone file so the port definition and every concrete provider can consume the same types without creating circular imports between them.

## Key elements

- **`CardDetails`** (interface) — the minimal card shape a provider receives; currently only `cardNumber: string`.
- **`cardLastFour`** (function) — strips all whitespace from a card number and returns the last four characters. The single safe projection of a card number permitted in logs, payment documents, and analytics.

## Relationships

- **`providers/index.ts`** — barrel for the providers directory; re-exports this module so consumers import from the directory root.
- **`providers/fake.ts`** — the test/demo provider; implements against the `CardDetails` interface and uses `cardLastFour` for its output.
- **`service.ts`** — the payments service; constructs or passes `CardDetails` into provider calls.
- **`tests/unit/providers.test.ts`** — unit tests that exercise `cardLastFour` (whitespace stripping, short-number edge cases) and verify providers consume `CardDetails` correctly.

## Notes

- `cardLastFour` uses `String#replaceAll` with the `u` flag; input shorter than 4 characters (after whitespace removal) will silently return the entire string rather than a masked value. Callers are responsible for validating length upstream.
- The module deliberately exports **no** card-number storage or formatting helpers — only the last-four projection. Adding any helper that retains the full number violates the stated invariant in the doc comment.
