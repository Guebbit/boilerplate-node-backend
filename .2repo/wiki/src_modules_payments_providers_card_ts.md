# src/modules/payments/providers/card.ts

## Purpose

Shared contract for card data crossing the provider boundary. It defines the minimal `CardDetails` shape a provider receives and exposes `cardLastFour` as the sole safe projection of a card number. Keeping it in its own file lets the port and every provider import it independently without creating circular imports between them.

## Key elements

- **`CardDetails`** (interface) — the only data a provider is given about a card. Currently a single `cardNumber: string` field.
- **`cardLastFour`** (function) — strips all whitespace from a card number and returns the last four characters. Intended for logs, payment documents, and analytics where the full number must never appear.

## Relationships

- **`src/modules/payments/providers/fake.ts`** — imports `CardDetails` as its input type and `cardLastFour` for safe logging in the fake implementation.
- **`src/modules/payments/providers/index.ts`** — barrel re-export; makes `CardDetails` and `cardLastFour` available to consumers of the `providers` package.
- **`src/modules/payments/service.ts`** — calls `cardLastFour` when writing audit/log lines and passes `CardDetails` into provider methods.
- **`src/modules/payments/tests/unit/providers.test.ts`** — constructs `CardDetails` fixtures and asserts on `cardLastFour` output to verify masking behavior.

## Notes

- `cardLastFour` uses `replaceAll(/\s/gu, '')` before slicing, so it is tolerant of spaces, dashes, or other whitespace characters in the stored number. It does **not** validate length or numeric content — a number shorter than 4 characters will return fewer digits silently.
- The file is intentionally type-and-utility only; do not add business logic here. If a new field is needed on the card, extend `CardDetails` and adjust the provider implementations.
