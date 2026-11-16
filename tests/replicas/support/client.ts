/**
 * @module
 * A small JSON client for the multi-copy cases: plain `fetch` against a base URL, the account
 * flow every case starts with (sign up, log in) and the session cookie's carry-over.
 *
 * @see docs/build/cluster-testing.md#the-multi-copy-suite
 */

/** What a call answered. */
export interface Answer {
    /** HTTP status. */
    status: number;
    /** The `Idempotent-Replayed` header, when the answer was a replay. */
    replayed: boolean;
    /** The `Set-Cookie` lines. */
    setCookie: string[];
    /** The parsed JSON body, `undefined` for an empty one. */
    body: unknown;
}

/** An account signed in once, ready to be used against any copy. */
export interface Session {
    /** The bearer access token. */
    bearer: string;
    /** The `Cookie` header carrying the refresh session. */
    cookie: string;
}

/**
 * One call. A fresh connection is not forced: the proxy decides which copy answers.
 *
 * @param base - base URL, a copy or the proxy
 * @param path - request path
 * @param init - `fetch` options
 */
export const call = (base: string, path: string, init: RequestInit = {}): Promise<Answer> =>
    fetch(base + path, init).then((response) =>
        response.text().then((text) => ({
            status: response.status,
            replayed: response.headers.get('idempotent-replayed') === 'true',
            setCookie: response.headers.getSetCookie(),
            // Narrowing: every body this suite reads is JSON or empty.
            body: text === '' ? undefined : (JSON.parse(text) as unknown)
        }))
    );

/** JSON headers, plus an optional bearer. */
export const jsonHeaders = (bearer?: string): Record<string, string> => ({
    'content-type': 'application/json',
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
});

/** The password every account in this suite uses. */
const PASSWORD = 'Sup3r-secret-pass!x';

/**
 * Throws unless `answer` carries the expected status, naming the step and the body: a signup that
 * answered 409 would otherwise surface later as a bearer of `undefined`.
 *
 * @param step - what was being done, for the message
 * @param answer - what the call answered
 * @param expected - the status the step must have
 * @throws {Error} when the status differs
 */
const expectStatus = (step: string, answer: Answer, expected: number): Answer => {
    if (answer.status !== expected)
        throw new Error(
            `${step} answered ${String(answer.status)}, expected ${String(expected)}: ${JSON.stringify(answer.body)}`
        );
    return answer;
};

/**
 * Signs a new account up and logs it in, both through `base`.
 *
 * @param base - base URL, normally the proxy
 * @param name - local part of the address, unique per case
 */
export const signUpAndLogIn = (base: string, name: string): Promise<Session> =>
    call(base, '/account/signup', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
            email: `${name}@example.com`,
            username: name,
            password: PASSWORD,
            passwordConfirm: PASSWORD,
            termsAccepted: true
        })
    })
        .then((signup) => expectStatus('Signup', signup, 201))
        .then(() =>
            call(base, '/account/login', {
                method: 'POST',
                headers: jsonHeaders(),
                body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD })
            })
        )
        .then((login) => {
            expectStatus('Login', login, 200);
            // Narrowing: the login contract answers `{ token }` on success.
            const { token } = login.body as { token: string };
            return {
                bearer: token,
                cookie: login.setCookie.map((line) => line.split(';', 1)[0]).join('; ')
            };
        });
