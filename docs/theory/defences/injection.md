# Injection

Untrusted data reaches an interpreter — a query planner, a shell, a template engine, a regex
engine, a log parser — without being separated from the instructions. The oldest family and still
the most damaging, because the interpreter is doing exactly what it was told.

The mechanism is always the same shape: **a value crosses into a position where syntax is
meaningful.** Every defence below is a variation on keeping it a value.

## Into a database query

| Attack                           | How it works                                                                 | This boilerplate                                                                                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection (SQLi)             | string concatenation into a statement; error-based, union, blind, time-based | No surface — there is no SQL database. The store is MongoDB through Mongoose.                                                                                                                                                                                         |
| Second-order SQLi                | value sanitised on entry, re-used raw in a later query                       | No surface, same reason. The general shape — "sanitise on entry" — is not the strategy anywhere here; values are typed at the boundary and stay typed.                                                                                                                |
| NoSQL injection                  | a JSON body carrying `$gt`, `$ne`, `$where`, `$regex` into a filter object   | An operator object fails `z.string()` before it can reach a filter. `POST /account/login` reads `email` raw and the SERVICE parses it against `LoginBody` before querying — `infrastructure/http/controller.ts#parseBody`, `account/services/authentication.ts#login` |
| Aggregation / pipeline injection | user-controlled field names or stages reach an aggregation                   | No stage, field name or `$expr` operand is ever built from request input; the three `$expr` uses compare two stored fields — `products/repository.ts`, `users/repository.ts`                                                                                          |
| ORM / query-builder injection    | raw fragments, unsafe `where` strings, dynamic sort/order fields             | No client-controlled sort: `findAll` takes `sort` from the repository's own `DEFAULT_SORT`, and no contract operation declares a sort parameter — `infrastructure/persistence/create-repository.ts`                                                                   |
| LDAP injection                   | unescaped `*`, `(`, `)`, `\|`, `&` in a directory query                      | No surface: no directory server, no LDAP client.                                                                                                                                                                                                                      |
| XPath / XQuery injection         | SQLi's shape, against XML documents                                          | No surface: nothing queries XML.                                                                                                                                                                                                                                      |
| GraphQL injection                | string-built queries; resolvers passing arguments to SQL or a shell          | No surface: REST only — see [The API surface](api-surface.md#which-routes-exist).                                                                                                                                                                                     |

Search text is the one place a request value legitimately becomes part of a pattern, and it is
handled in [Into a pattern](#into-a-pattern) below.

## Into the operating system or the runtime

| Attack                   | How it works                                                                    | This boilerplate                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS command injection     | `exec`-style calls with interpolated strings — `;`, `\|`, `$( )`, backticks     | No surface: `child_process`, `exec` and `spawn` appear nowhere in `src/`.                                                                                                                                 |
| Argument injection       | a safe `spawn`, but a value beginning with `-` is read as a flag                | No surface, same reason.                                                                                                                                                                                  |
| Code injection / `eval`  | `eval`, `new Function`, `vm` sandboxes, dynamic `import`                        | No surface: none of the three appears in `src/`.                                                                                                                                                          |
| JNDI / lookup injection  | `${jndi:ldap://…}` resolved by a logger or config layer (Log4Shell)             | No surface: pino performs no lookups in the strings it writes — `infrastructure/adapters/logger.ts`.                                                                                                      |
| Insecure deserialization | serialised payloads with gadget chains; `pickle`, YAML, language-native         | `JSON.parse` only, and the two places it runs on untrusted bytes degrade to a miss or a dead-letter rather than throwing — `infrastructure/http/middlewares/cache.ts`, `infrastructure/adapters/queue.ts` |
| Prototype pollution      | a recursive merge or a `__proto__` key makes later logic read attacker defaults | No deep merge anywhere in `src/`. The one library-level exposure was mongoose's dotted-path variant, closed by the upgrade recorded in [Supply chain](supply-chain.md#the-package-itself).                |

## Into a template

| Attack                                | How it works                                                            | This boilerplate                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side template injection (SSTI) | user text goes into the template STRING rather than a template variable | EJS interpolates with `<%= %>`, which HTML-escapes; `<%- %>` appears only on `include(…)` of a fixed layout path — `shared/templates/` |
| Expression-language injection         | SpEL, OGNL, JEXL, MVEL evaluated from request parameters                | No surface: no expression evaluator in the stack.                                                                                      |
| Server-side includes (SSI) injection  | `<!--#exec … -->` in a page the server processes for includes           | No surface: no include-style loader, no SSI processor.                                                                                 |
| Client-side template injection        | user text reaches a browser framework's expression evaluator            | The frontend's row — see [Client-side](client-side.md#script-execution-in-the-origin).                                                 |

## Into a protocol or a document

Every row here is the same bug: a value carries a delimiter the protocol treats as structure.

| Attack                    | How it works                                                      | This boilerplate                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log injection / forging   | newlines or ANSI codes in a value written to a log line           | `x-request-id` is validated against a UUID shape before it is reflected back or written; no other request-controlled value reaches a log line unstructured, and pino writes JSON, where a newline is escaped by the serialiser — `app/request-context.ts` |
| CRLF injection            | `\r\n` inside a header value, a log line or an SMTP dialogue      | Same answer as log injection above for logs; for mail, see [Email](email.md#mail-this-app-sends); for headers, the row below.                                                                                                                             |
| HTTP header injection     | CRLF inside a redirect target, a cookie value or a custom header  | No response header is built from request input. Express 5 rejects a header value containing CR or LF outright.                                                                                                                                            |
| HTTP response splitting   | CRLF injection producing a second, attacker-shaped response       | Same answer as HTTP header injection above.                                                                                                                                                                                                               |
| Email header injection    | a newline in `subject`/`from` adds `Bcc:` or new recipients       | The contact form's `subject` IS user text concatenated into the Subject — nodemailer's `mime-node` strips CR/LF from every header value, so the stop is the LIBRARY's — `feedback/emails.ts#contactRequestEmail`                                          |
| CSV / formula injection   | a cell starting with `=`, `+`, `-` or `@` executes when opened    | No surface: nothing exports a spreadsheet; the account export answers JSON — `account/services/export.ts`                                                                                                                                                 |
| XML external entity (XXE) | a DTD with external entities enabled → local file read, SSRF, DoS | No surface: nothing parses XML. Express is given exactly three parsers — JSON, urlencoded, multipart — so there is no XML branch to negotiate into — `app/security.ts`                                                                                    |
| XML injection             | unescaped angle brackets in generated XML                         | No surface: nothing generates XML.                                                                                                                                                                                                                        |

## Into a pattern

| Attack          | How it works                                                 | This boilerplate                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regex injection | a user value passed to `new RegExp` → ReDoS or filter bypass | `new RegExp` appears nowhere. The only `$regex` patterns come from `toSearchPattern`, which strips C0/DEL and escapes every metacharacter — `infrastructure/persistence/search.ts#toSearchPattern` |
| ReDoS           | nested quantifiers backtracking catastrophically             | Same answer — an escaped pattern has no quantifier to nest. The contract's own patterns are checked for catastrophic shapes by `tests/cross-cutting/search-regex.test.ts`.                         |

## Into a path or a model

| Attack                             | How it works                                                                     | This boilerplate                                                                                                                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mass assignment / autobinding      | a request body bound straight to a model; `role`, `price`, `ownerId` overwritten | Two layers. Every body schema is `.strict()` (`orval.config.ts#override.zod.strict.body`), so an unknown key answers 422 instead of being silently stripped — and even a declared-but-unwanted key has no assignment to reach, because `users/service.ts#update` assigns field by field. |
| Mass assignment — privilege fields | `role=admin` in a profile update                                                 | `zodProfileSchema` (self-service `PUT /account`) is strict and scoped to named fields; `role`, `active` and `password` are not among them, so a user cannot promote themselves — refused with 422, not silently ignored — `account/services/profile.ts#zodProfileSchema`                 |
| Host header injection              | absolute URLs, reset links or cache keys built from `Host`                       | `request.hostname`, `Host` and `X-Forwarded-Host` are read nowhere. Every generated link is built from `NODE_URL` / `NODE_FRONTEND_URL` — `account/emails.ts`, `account/oauth/config.ts`                                                                                                 |
| Path / URL parameter injection     | a user value concatenated into a filesystem path or an internal URL              | The client's filename is discarded whole: a stored name is 16 random bytes of hex plus an extension from a closed set — `infrastructure/adapters/storage.ts#resolveUploadFilename`, and [Files and uploads](files-and-uploads.md#where-it-gets-stored-and-where-it-is-read-from)         |

## The one rule behind all of it

Every write endpoint parses its body against the Zod schema orval generates from `openapi.yaml`,
in `parseBody`. That is not a sanitiser — it is a **type gate**: a value that is not the declared
shape never becomes a value of the wrong shape, it becomes a 422. Most rows above are closed by
that gate rather than by anything written for the attack by name.

## Related

- [Files and uploads](files-and-uploads.md) — the path half of this family
- [Email](email.md) — the SMTP half
- [Data layer](data-layer.md) — where a filter that survived this page actually runs
