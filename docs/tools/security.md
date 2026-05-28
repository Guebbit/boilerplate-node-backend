# Security

## Main security tools

| Tool                                                                                                                                 | Why it is here                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| [Helmet](https://helmetjs.github.io/)                                                                                                | safe default HTTP headers                   |
| [cors](https://github.com/expressjs/cors#readme)                                                                                     | origin allowlist and browser access control |
| [express-rate-limit](https://express-rate-limit.mintlify.app/)                                                                       | basic abuse protection at the edge          |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken#readme)                                                                    | access and refresh token flows              |
| [cookie-parser](https://github.com/expressjs/cookie-parser#readme)                                                                   | cookie access in Express                    |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js#readme)                                                                          | password hashing                            |

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

## Useful links

- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [Helmet content security policy](https://helmetjs.github.io/#content-security-policy)
- [MDN — CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [express-rate-limit configuration](https://express-rate-limit.mintlify.app/reference/configuration)
- [jsonwebtoken algorithms](https://github.com/auth0/node-jsonwebtoken#algorithms-supported)
- [bcrypt cost factor guidance](https://github.com/kelektiv/node.bcrypt.js#a-note-on-rounds)

## Related pages

- [Request Flow](../theory/request-flow.md)
- [Winston & Audit Logs](./winston.md)
- [REST Style](../api/rest-style.md)
