# Field limits

Every string a request can carry declares its own `maxLength`. A field with no bound is limited
only by the 100 kB body limit, so one field can cost a hundred kilobytes of memory, of Mongo
document and of log line. Two Spectral rules enforce it, on the root bundle and on every module
fragment:

- `string-declares-max-length` for the strings inside a body or a parameter's schema.
- `string-parameter-declares-max-length` for a parameter whose schema IS the string (a filter, a
  header, a path id).

The rules live in `shared/contracts/spectral.yaml`; `npm run lint:openapi` and
`npm run lint:openapi:modules` run them.

## What is exempt

| Shape | Why |
| --- | --- |
| `enum` | the longest member is the bound |
| `format: date`, `date-time`, `uuid`, `time` | fixed length |
| `format: binary` (a file part) | bounded by the upload limit |
| `allOf` / `oneOf` / `anyOf` | the bound is on the part it names |
| a response | the server's own text |

`pattern`, `format: email` and `format: uri` are NOT exemptions: none of them bounds a length.

## Values by kind

Pick the smallest value the real data fits in. The shared `Text` (1 to 200), `Email` (254) and
`Id` schemas exist so the common choice is a `$ref`.

| Kind | `maxLength` |
| --- | --- |
| Code, key, enum-like name, provider, method | 32 |
| Username | 50 |
| Identifier, filter on an id, secret id | 64 |
| Name, title, action filter | 100 |
| Password (a form or a login) | 128 |
| Short text, `Text` | 200 |
| Email address | 254 |
| Reason, note, description | 500 to 1000 |
| Locale string value, free message | 2000 |
| URL, OAuth `code` | 2048 |
| Challenge token header | 4096 |
| Long description | 10000 |
| A JSON document sent as one string (multipart `translations`) | 100000 |

A query filter takes the same value as the body field it mirrors (`username` 50, `notes` 1000):
`contract-search-parity` checks that the two agree.

## Where the number is read

The generated Zod schemas under `api/` carry the value, and the models import them, so the bound
is enforced with no hand-written copy. Where a controller replaces a generated field (a multipart
body, an `.extend`), it imports the generated `...Max` constant instead of repeating the number.

See: [Contract Ownership & Fragmentation](./contract-fragmentation.md),
[Regenerating After a Change](./regenerating.md)
