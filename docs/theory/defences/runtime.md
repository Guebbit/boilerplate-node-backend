# Runtime and language level

Bugs that live below the application logic and surface through it. Node's own sharp edges, the
process lifecycle, and the native code every image and crypto library is really made of.

The distinguishing feature of this family: the application code can be entirely correct and still
be the delivery vehicle. A crafted JPEG is not an injection — it is a valid image that happens to
hit a bug in libjpeg.

## The process staying up

A crash is an availability bug, and a crash LOOP is an outage. Worse, the state after an unexpected
throw is unknown — which is why the answer below is "stop", not "carry on".

| Attack                            | How it works                                       | This boilerplate                                                                                                                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unhandled rejections / exceptions | one bad request kills a worker; restart storms     | Both are registered: a rejection is audited, and an uncaught exception is audited AND THEN EXITS — the state after one is unknown, so the only safe move is to stop — `app/error-handling.ts#installErrorHandling`. The cluster supervisor restarts the worker; see [Clustering](../clustering.md). |
| Event-loop blocking               | synchronous CPU work or sync I/O in a request path | See [Denial of service](denial-of-service.md#expensive-work-from-a-cheap-request).                                                                                                                                                                                                                  |

## The language's own sharp edges

| Attack                                 | How it works                                                             | This boilerplate                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vm` / sandbox escape                  | "sandboxed" code reaches the host — `vm` is not a security boundary      | No surface: `vm` appears nowhere in `src/`.                                                                                                                                               |
| Unsafe `eval` / `Function`             | input executed by the runtime                                            | No surface — see [Into the operating system or the runtime](injection.md#into-the-operating-system-or-the-runtime).                                                                       |
| `child_process` misuse                 | a shell command built from input                                         | No surface, same section.                                                                                                                                                                 |
| Prototype pollution                    | `__proto__` keys survive a recursive merge                               | Same section.                                                                                                                                                                             |
| ReDoS                                  | catastrophic backtracking on user input                                  | See [Into a pattern](injection.md#into-a-pattern).                                                                                                                                        |
| Path resolution quirks                 | `path.join` vs. `path.resolve` — an absolute segment discards the prefix | `toPosixPath` is the one normalisation, and it is safe only because the names it sees are random hex — which is stated where it is written — `infrastructure/http/uploads.ts#toPosixPath` |
| Case-insensitive / Unicode filesystem  | `Admin.TS` on macOS or Windows; normalisation forms bypass a check       | No check compares a filesystem path against a string. Stored names are random hex from a closed extension set — see [Files](files-and-uploads.md#what-gets-stored).                       |
| Weak `Math.random` / `Date.now` tokens | predictable tokens from a non-cryptographic source                       | Every token, code, filename, `jti` and IV comes from `node:crypto` — `randomBytes`, `randomUUID` or `randomInt`. See [Randomness and keys](crypto-and-secrets.md#randomness-and-keys).    |

## Configuration from the environment

`process.env` is untrusted input that happens to arrive at boot rather than over HTTP, and it is
usually typed as `string | undefined` and then used as a number.

| Attack                       | How it works                                                                   | This boilerplate                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Environment-variable trust   | unvalidated config; proxy vars, `NODE_OPTIONS`, `NODE_TLS_REJECT_UNAUTHORIZED` | `environmentNumber` bounds every numeric env read — a typo produces the documented default, not `NaN` propagating into a timeout — and the boot gate refuses to start on a missing, too-short or placeholder secret — `infrastructure/runtime/environment.ts`, `kernel/required-config.ts` |
| Debugger / inspector exposed | `--inspect` reachable from the network is remote code execution                | Nothing passes `--inspect`; `npm start` is `tsx src/cluster.ts` — `package.json`                                                                                                                                                                                                           |

The `body-parser` advisory is the cautionary tale for this section: an INVALID `limit` value
silently disabled size enforcement rather than failing. A config value that is wrong should be
loud, which is exactly what `environmentNumber` and the boot gate are for.

## Native code

Every row here is someone else's C, reached through a JavaScript API. The application cannot patch
them; it can only bound what reaches them and keep them current.

| Attack                                  | How it works                                                | This boilerplate                                                                                                                                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Buffer overflow / use-after-free        | memory corruption in image, compression or crypto libraries | Bound what reaches them: three formats only, magic-number verified, and `limitInputPixels` capping the decode — see [Files](files-and-uploads.md#what-the-bytes-do-once-accepted). Keep them current: the `audit` job — see [Supply chain](supply-chain.md). |
| Buffer over-read / uninitialised memory | a native module, or the old `Buffer()` API                  | `Buffer.from` / `Buffer.alloc` only; the unsafe constructor appears nowhere in `src/`.                                                                                                                                                                       |
| Integer overflow in native code         | size checks wrap, leading to memory corruption              | Same answer as the overflow row above — the byte and pixel ceilings are what keep sizes in a sane range before a decoder sees them.                                                                                                                          |
| Format-string bugs                      | native logging with a user-controlled format string         | No surface in Node; pino writes structured JSON and takes no format string from input.                                                                                                                                                                       |
| Memory disclosure                       | Heartbleed-style over-reads                                 | Dependency currency is the only control — see [Supply chain](supply-chain.md).                                                                                                                                                                               |
| Header parsing leniency                 | duplicate header quirks contribute to smuggling             | See [HTTP and caches](http-and-caches.md#two-parsers-disagreeing).                                                                                                                                                                                           |

## The container the runtime sits in

The production image drops to the `node` user after the last install step, so a memory-corruption
bug in a native library lands as an unprivileged process rather than as root — see
[Infrastructure](infrastructure.md#the-container-and-the-image). That is the mitigation that
actually applies to the rows above, since none of them can be prevented from inside `src/`.

## Related

- [Injection](injection.md) — where most "see the injection section" rows above go
- [Denial of service](denial-of-service.md) — the availability half
- [Supply chain](supply-chain.md) — keeping the native libraries current
- [Clustering and shutdown](../clustering.md) — what happens after the process exits
