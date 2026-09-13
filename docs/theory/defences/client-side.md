# Client-side

Attacks that run in the victim's browser. The site's own **origin** is the prize: anything that
executes or reads inside it inherits the victim's cookies, storage and permissions, which is why
one XSS is worth more than it looks — it is not "a popup", it is the attacker running as the user.

This is a backend repo, so most of this family belongs to the paired Vue frontend and is walked on
its own
[Web Attack Defences](https://github.com/Guebbit/boilerplate-vue-frontend/blob/main/docs/theory/web-attack-defences.md)
page. What lives **here** is the half of each shared row this API owns — and those are the rows
worth reading, because a control split across two repos is the kind that gets half-implemented.

## Rows that need both halves

Marked **shared**: neither repo closes them alone.

| Attack                            | How it works                                                                 | This backend's half                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-site request forgery (CSRF) | cookies auto-attached to a cross-site form or fetch; no token, no `SameSite` | **No ambient cookie authenticates a mutation.** Every write requires an `Authorization: Bearer` header, which the browser never attaches on its own — only code the frontend runs can. The refresh cookie the browser DOES send automatically only reaches `GET /account/refresh`, which MINTS a token rather than acting on one. The frontend's half is attaching the header — `boilerplate-vue-frontend/src/infrastructure/http/interceptors.ts#onRequest`. |
| Login CSRF                        | a forged login form lands the victim in the attacker's session               | The OAuth callback is the case that matters: a double-submit `state` cookie, minted and set in the same response that hands it to the provider, and the callback rejects a mismatch with 400 — `account/oauth/state.ts`, `account/controllers/get-oauth-callback.ts`. The frontend's only role is the top-level navigation that starts the dance.                                                                                                             |
| Clickjacking / UI redress         | the page loaded in an invisible iframe under a decoy                         | `helmet()` sets `X-Frame-Options: SAMEORIGIN` AND `frame-ancestors 'self'` via its default CSP on this app's responses; the frontend's static server sets the equivalent for the HTML pages an attacker would actually frame — `app/security.ts`                                                                                                                                                                                                              |
| Drag-and-drop / cursorjacking     | clickjacking variants — an offset cursor, or drag data carried across frames | Same answer as clickjacking above: the frames the attacker wants are the frontend's HTML pages, and `frame-ancestors 'self'` is what refuses them. This API's JSON responses are not framable content.                                                                                                                                                                                                                                                        |
| Cookie flag omissions             | missing `HttpOnly`, `Secure`, `SameSite`                                     | The refresh cookie (`jwt`) is `httpOnly`, `sameSite: 'lax'`, `secure` in production. The `isAuth` UI hint set alongside it is deliberately none of those — it carries no credential — `account/session/cookies.ts`. See [Taking the session](authentication.md#taking-the-session).                                                                                                                                                                           |
| CORS misconfiguration             | a reflected `Origin`, `null` allowed, or a wildcard with credentials         | An explicit origin allowlist, never `*` — load-bearing, because the frontend sends every request with `withCredentials: true`, which a browser refuses to honour against a wildcard — `app/security.ts`                                                                                                                                                                                                                                                       |
| Missing security headers          | no HSTS, `nosniff`, `Referrer-Policy`                                        | `helmet()` globally on this app's responses — see [Infrastructure](infrastructure.md#headers-the-browser-acts-on) for the full set. The frontend's static server sets the equivalent for the HTML this app never touches.                                                                                                                                                                                                                                     |
| Spam via forms (honeypot)         | a bot fills every field, including the one no human can see                  | The contract declares a `website` field nothing persists; a non-empty value writes the row as `spam` — the frontend renders it `aria-hidden` and `tabindex="-1"` — `feedback/service.ts#create`. See [Automation and abuse](automation-and-abuse.md#accounts-and-content-at-scale).                                                                                                                                                                           |
| Web cache deception               | `/account/me.css` tricks a cache into storing a private page                 | The response cache is keyed by caller and locale — see [HTTP and caches](http-and-caches.md#caches).                                                                                                                                                                                                                                                                                                                                                          |

## Script execution in the origin

The XSS family. **None of it is closed by this repo** — a JSON API has no HTML for a payload to
land in — but two things here shape how much an XSS would be worth.

| Attack                         | How it works                                                         | Whose row                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| XSS — reflected                | an unescaped parameter rendered in HTML, delivered by a crafted link | Frontend. This API reflects no request value into a response body.                                                             |
| XSS — stored                   | unescaped user content rendered later to many victims                | Frontend rendering; this API stores what it is given and escapes on the way into EMAIL templates only.                         |
| XSS — DOM-based                | client code writes `location`, `hash` or `postMessage` into the DOM  | Frontend, entirely.                                                                                                            |
| XSS — mutation (mXSS)          | markup safe as text that mutates into script on re-serialisation     | Frontend.                                                                                                                      |
| XSS — blind                    | the payload fires in a support ticket or admin dashboard             | Frontend — but the contact form is this API's intake, and it stores text, never markup.                                        |
| XSS — universal (UXSS)         | a browser bug crossing origins                                       | Nobody's — the browser's. Reduce impact, cannot prevent.                                                                       |
| HTML / CSS injection           | phishing forms or attribute-selector leaks inside a trusted page     | Frontend.                                                                                                                      |
| Dangling markup injection      | an unclosed tag swallows the following HTML, tokens included         | Frontend.                                                                                                                      |
| DOM clobbering                 | `<a id="config">` shadows a global scripts trust                     | Frontend.                                                                                                                      |
| Client-side template injection | user text reaches a framework's expression evaluator                 | Frontend.                                                                                                                      |
| Service-worker abuse           | an XSS registers a worker that outlives the original bug             | Frontend.                                                                                                                      |
| Formjacking / Magecart         | an injected third-party script skims form data                       | Frontend — and [Supply chain](supply-chain.md#things-served-from-elsewhere) on this side: this process loads no remote script. |

**What this backend does to limit the blast radius.** The access token is short-lived and the
refresh token is `httpOnly`, so an XSS steals a token that expires rather than a session that does
not. And no sensitive action accepts a merely-valid session: changing the email, deleting the
account, checking out and confirming payment all demand a RECENT one — see
[Step-up authentication](authentication.md#step-up-authentication). An XSS is still very bad; it
is just not automatically account takeover plus a purchase.

## Cross-origin reading and navigation

| Attack                             | How it works                                                    | Whose row                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open redirect                      | `?next=` not validated; used for phishing and OAuth token theft | **Closed here.** The redirect URI and post-login URL are both derived from server config, never from the request or the provider's answer — `account/oauth/config.ts#oauthRedirectUri` |
| Tabnabbing (reverse)               | `window.opener` without `noopener` rewrites the original tab    | Frontend.                                                                                                                                                                              |
| `postMessage` abuse                | a listener without an origin check; a sender to `*`             | Frontend.                                                                                                                                                                              |
| Cross-site script inclusion (XSSI) | a JS-shaped response read via `<script src>`; JSONP             | No surface: every response is `application/json`, and there is no JSONP endpoint.                                                                                                      |
| Cross-site leaks (XS-Leaks)        | timing, frame counting, error events, cache probing             | Frontend, mostly. This API's uniform error shapes reduce the signal — see [Enumeration](disclosure.md#the-response-saying-more-than-the-ui-shows).                                     |
| Cross-site WebSocket hijacking     | a cookie-authenticated upgrade with no origin check             | No surface — see [Real-time](real-time.md#opening-the-stream).                                                                                                                         |

## Policy and delivery

| Attack                        | How it works                                                     | Whose row                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP bypass                    | `unsafe-inline`, a permissive `script-src`, a missing `base-uri` | Shared, and mostly the frontend's. `helmet()` DOES set a default CSP on this API's own responses (`default-src 'self'`, `object-src 'none'`, `script-src 'self'`) — but a JSON response has no script to govern, so the CSP that matters is the one over the frontend's HTML, which this app never serves. |
| Subresource without integrity | a CDN script altered in transit or at source                     | Frontend. Nothing is loaded from a CDN on this side.                                                                                                                                                                                                                                                       |
| Mixed content                 | an HTTPS page loading HTTP resources                             | Frontend, plus the terminating proxy.                                                                                                                                                                                                                                                                      |
| Drive-by download             | a compromised page or ad triggers a download                     | Frontend, plus ad-network choices.                                                                                                                                                                                                                                                                         |

## Data the browser holds

| Attack                           | How it works                                        | Whose row                                                                                                                                    |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive data in client storage | tokens in `localStorage`, PII in IndexedDB          | Shared. This API's part is keeping the REFRESH token in an `httpOnly` cookie the frontend cannot read at all — `account/session/cookies.ts`. |
| Client-side prototype pollution  | query-string parsers and deep-merge utilities       | Frontend.                                                                                                                                    |
| Client-side path traversal       | `../` in a value used to build a fetch URL          | Frontend. This API's routes are contract-declared, so a traversed path is a 404.                                                             |
| Clipboard / autofill abuse       | hidden fields autofilled, `copy` events rewritten   | Frontend.                                                                                                                                    |
| History sniffing                 | timing side channels on `:visited`                  | The browser's.                                                                                                                               |
| Browser fingerprinting           | canvas, fonts, audio, hardware quirks               | Frontend, and a privacy question more than an exploit — see [Data protection](../data-protection.md).                                        |
| Browser cache poisoning          | a cacheable response with injected content persists | No surface here: nothing reflects request input into a response body.                                                                        |

## Related

- [Authentication](authentication.md) — the cookies and tokens every shared row above is about
- [Infrastructure](infrastructure.md#headers-the-browser-acts-on) — the headers half
- [HTTP and caches](http-and-caches.md) — cache deception, from the server side
- The frontend's own [Web Attack Defences](https://github.com/Guebbit/boilerplate-vue-frontend/blob/main/docs/theory/web-attack-defences.md) — every row marked "frontend" above
