/**
 * @module
 * The HTTP caller the flow runner drives the app with: one base URL, one bearer token, and the
 * envelope unwrapping that every call would otherwise repeat.
 *
 * Deliberately not supertest, though the repo already depends on it for the test suites: this
 * file runs on a container boot (`npm run db:bootstrap` → `scenario:apply`), where
 * devDependencies may not be installed at all. `fetch` is the runtime's.
 *
 * See: docs/tools/demo-profile.md
 */

/** Every response this API sends, successful or not. Only these two fields are ever read here. */
interface Envelope {
    data?: unknown;
    errors?: { code?: string; message?: string }[];
}

/** An HTTP verb the flows use. `PATCH` is the products module's update shape. */
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** What a call came back with, before anything decides whether that was acceptable. */
export interface Attempt {
    status: number;
    /** The envelope's `data` — `undefined` for a 204 and for any body that carries none. */
    data: unknown;
    /** The first `errors[].code`, which is how every refusal in this API names itself. */
    errorCode: string | undefined;
    /** Every `errors[].message`, so a refusal says what it objected to and not only that it did. */
    errorMessages: string[];
}

/**
 * A call the flows expected to succeed came back a failure — the runner's only error type.
 *
 * Carries the request as well as the response: a seed that dies three hundred requests into a
 * boot is useless if the message only says `409`.
 */
export class ScenarioFlowError extends Error {
    constructor(who: string, method: Method, path: string, attempt: Attempt) {
        super(
            `${who}: ${method} ${path} answered ${String(attempt.status)}` +
                (attempt.errorCode ? ` (${attempt.errorCode})` : '') +
                ` — ${JSON.stringify(attempt.errorMessages.length > 0 ? attempt.errorMessages : attempt.data)}`
        );
    }
}

/** One signed-in actor driving the app over HTTP. Built by {@link signIn}. */
export interface Caller {
    /** Whose session this is — used to make an error message name the actor. */
    readonly email: string;

    /**
     * Call, and throw unless the response is a 2xx.
     *
     * @param method - the verb
     * @param path - everything after the base URL, leading slash included
     * @param body - JSON request body, or nothing
     * @throws {ScenarioFlowError} on any non-2xx
     */
    call: <T>(method: Method, path: string, body?: unknown) => Promise<T>;

    /** Call and hand back the outcome whatever it was — for a refusal the flows WANT. */
    attempt: (method: Method, path: string, body?: unknown) => Promise<Attempt>;
}

/** Parse a response into an {@link Attempt}. A 204 and a non-JSON body both yield no `data`. */
const readAttempt = (response: Response): Promise<Attempt> =>
    response.json().then(
        (body: unknown) => {
            const envelope = body as Envelope;
            return {
                status: response.status,
                data: envelope.data,
                errorCode: envelope.errors?.[0]?.code,
                errorMessages: (envelope.errors ?? []).map((error) => error.message ?? '')
            };
        },
        () => ({
            status: response.status,
            data: undefined,
            errorCode: undefined,
            errorMessages: []
        })
    );

/** One request, with whatever headers the caller has. The one place `fetch` is actually called. */
const send = (
    baseUrl: string,
    headers: Record<string, string>,
    method: Method,
    path: string,
    body?: unknown
): Promise<Attempt> =>
    fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    }).then(readAttempt);

/**
 * Sign `email` in through the real `POST /account/login` and return a caller holding its token.
 *
 * Through the endpoint, never a hand-signed token: a flow-produced dataset is only worth more
 * than a written one if every row really did come through the code a browser reaches, and the
 * session is the first link of that chain. It also makes the caller FRESH, which
 * `requireFreshAuth(REAUTH_TIME_CRITICAL)` on checkout and on every payment route demands.
 *
 * @param baseUrl - where the app is listening, without a trailing slash
 * @param email - the account to sign in as
 * @param password - its plaintext password, as `scenarios/accounts.ts` seeded it
 * @throws {ScenarioFlowError} when login does not answer 200 with a token
 */
export const signIn = (baseUrl: string, email: string, password: string): Promise<Caller> =>
    send(baseUrl, { 'content-type': 'application/json' }, 'POST', '/account/login', {
        email,
        password
    }).then((attempt) => {
        const token = (attempt.data as { token?: string } | undefined)?.token;
        if (attempt.status !== 200 || !token)
            throw new ScenarioFlowError(email, 'POST', '/account/login', attempt);

        const headers = {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`
        };
        const attemptAs = (method: Method, path: string, body?: unknown) =>
            send(baseUrl, headers, method, path, body);

        return {
            email,
            attempt: attemptAs,
            call: <T>(method: Method, path: string, body?: unknown): Promise<T> =>
                attemptAs(method, path, body).then((outcome) => {
                    if (outcome.status < 200 || outcome.status >= 300)
                        throw new ScenarioFlowError(email, method, path, outcome);
                    return outcome.data as T;
                })
        };
    });
