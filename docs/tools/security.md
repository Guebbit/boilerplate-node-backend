# Security

## Main security tools

| Tool                            | Why it is here                              |
| ------------------------------- | ------------------------------------------- |
| Helmet                          | safe default HTTP headers                   |
| cors                            | origin allowlist and browser access control |
| express-rate-limit              | basic abuse protection at the edge          |
| jsonwebtoken                    | access and refresh token flows              |
| cookie-parser                   | cookie access in Express                    |
| express-session + connect-mongo | stateful session support when needed        |
| csrf-sync                       | CSRF protection for cookie/session flows    |
| bcrypt                          | password hashing                            |

## Security flow

```mermaid
flowchart LR
    Request --> Helmet
    Helmet --> CORS
    CORS --> RateLimit
    RateLimit --> Auth
    Auth --> Controller
```

## Strategy

Security concerns should happen **before** business logic reaches deep layers.
That is why auth, headers, origin checks, and rate limiting stay near routes and middlewares.

## Related pages

- [Request Flow](../theory/request-flow.md)
- [Winston & Audit Logs](./winston.md)
- [REST Style](../api/rest-style.md)
