---
source: src/infrastructure/adapters/log-scrub.ts
source_sha256: e8a388ecd84c197146bfb44562d2f5c4b58ddf8202178e204a8c023d0dd9289b
context_sha256: 692d7ca904c9c54a79740629a376d5ddf77f7cd75ff5dc09a2d502a27f35589b
generated_at: 2026-11-22T02:39:02.622694+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/log-scrub.ts

## Purpose
Decides what of an error and of a message text may reach a log line. Redaction by key name never reads message text, so this file covers that gap: known error classes keep identifying fields but not their message, and any message has its email and IP addresses replaced by a pseudonym. It uses relative imports only, because `logger.ts` imports it and it sits on jest `globalSetup`'s chain.

## Key elements
- `scrubError(error)`: returns a scrubbed field record for known error classes, or `undefined` for any other error (the caller then keeps it whole).
  - Mongo/Mongoose/BSON errors: `name`, `code`, and only the `    at ...` stack frames. The message is dropped because it carries offending values, such as a duplicate-key error naming the email.
  - Nodemailer-shaped errors (those with `command`, `responseCode` and `response`): `name`, `code`, `responseCode`, `command`, and the message with the SMTP server's reply removed, since the reply echoes the recipient.
- `maskMessage(text, pseudonym)`: replaces every email, IPv6 and IPv4 address in `text` with `pseudonym(address.toLowerCase())`. The address is lowercased first so it hashes the same as the stored lowercase `email` field.
- `isDatabaseError` (internal): matches `DATABASE_ERROR_NAME` against `error.name` and then against the constructor names along the prototype chain.
- `ADDRESS` (internal): a single global, case-insensitive, Unicode-aware regex that combines the email, IPv6 and IPv4 patterns, so an address is never matched twice.

## Relationships
- `src/infrastructure/adapters/logger.ts` imports this file, which is why it must use relative imports only.
- `src/app/error-handling.ts` and `src/infrastructure/runtime/otel-sdk.ts` are graph neighbors. The file itself does not import them or show how they call it.

## Notes
- The mask is pinned by a shared case file (kind `message`) that the PHP twin also runs. The regexes themselves are not shared between the two backends.
- Error classes are detected by `name` and by constructor names on the prototype chain, not `instanceof`. `mongodb` and `bson` are transitive dependencies, and a second copy would make `instanceof` return false.
- The prototype walk catches Mongoose subclasses (`DocumentNotFoundError`, `VersionError`, an app's own subclass), which end in `MongooseError` but name themselves differently.
- Stack frames are selected by shape (`/^\s+at /`), not by dropping the first line, because a message can span several lines.
- Email matching skips a domain whose first label is `<digits>x` (the retina image suffix pattern, e.g. `2x`).
- IPv6 needs a `::` or all eight groups, so clock times like `12:30:45` stay. IPv4 octets must be 0-255, so `999.1.1.1` stays.
