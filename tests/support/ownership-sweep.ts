/**
 * @module
 * The machinery both ownership sweeps share: send one request as customer B, judge B's answer
 * for another customer's id against the answer for an id that does not exist.
 *
 * What a case proves, in order:
 *   parity     the foreign id and `MISSING_ID` get the same status and the same `errors[]`
 *   documented the status (and error code) the contract names
 *   unmoved    the rows the caller watches read back unchanged after the two attacks
 *   control    B's OWN id gets past the lookup, so the two attacks did not agree by stopping at
 *              the same earlier refusal (an empty cart, a step-up 401, a limiter 429)
 *
 * A 422 is always a failure: it means the request never reached the lookup.
 */
import type { Response } from 'supertest';
import { api } from './http';

/** The verbs the contract uses on a route a customer can reach. */
export type Verb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** One request, as a customer sends it. */
export interface Attempt {
    method: Verb;
    path: string;
    /** The `Authorization` header value. */
    bearer: string;
    query?: Record<string, unknown>;
    body?: object;
}

/** What the contract says a foreign id answers. */
export interface DocumentedAnswer {
    status: number;
    /** `errors[0].code`, when the answer carries one. */
    code?: string;
    /** A list filter that narrows: 200 with `items: []`, never a 404. */
    emptyPage?: boolean;
    /** A filter the server ignores for this caller: no row of this id may appear in the page. */
    without?: string;
}

/** One owned id under test. */
export interface OwnedCase {
    /** The `OWNED_*` key this case covers. */
    key: string;
    answer: DocumentedAnswer;
    /** B's request aimed at another customer's id (`true`) or at one that does not exist (`false`). */
    aim: (foreign: boolean) => Attempt;
    /** Builds what the case needs, right before it runs (a cart, a partly shipped order). */
    prepare?: () => Promise<void>;
    /** B's request with B's own id; absent for a path id, whose 404 already pins the answer. */
    control?: () => Attempt;
    /** Whether the control got past the lookup. */
    controlPassed?: (response: Response) => boolean;
}

/** Sends one request through the real app. */
export const send = ({ method, path, bearer, query, body }: Attempt): Promise<Response> => {
    // `Lowercase<Verb>` is exactly supertest's method names; the cast only restores the literal
    // type that `toLowerCase()` widens to `string`.
    const verb = method.toLowerCase() as Lowercase<Verb>;
    const request = api()
        [verb](path)
        .set('Authorization', bearer)
        .query(query ?? {});
    return Promise.resolve(body === undefined ? request : request.send(body));
};

/** The part of an answer that must not tell the two ids apart. */
const shapeOf = (response: Response): string =>
    JSON.stringify({
        status: response.status,
        errors: response.body?.errors,
        items: response.body?.items
    });

/**
 * Runs one case.
 *
 * @param owned - the case
 * @param watch - reads back what the case must not change, as plain data
 * @returns what went wrong, one line each; empty when the case holds
 */
export const judge = async (owned: OwnedCase, watch: () => Promise<unknown>): Promise<string[]> => {
    await owned.prepare?.();
    const before = JSON.stringify(await watch());
    const foreign = await send(owned.aim(true));
    const missing = await send(owned.aim(false));
    const after = JSON.stringify(await watch());

    const problems: string[] = [];
    const say = (what: string) => problems.push(`${owned.key}: ${what}`);

    for (const [name, response] of [
        ['foreign', foreign],
        ['missing', missing]
    ] as const)
        if (response.status === 422) say(`${name} id answered 422, so it never reached the lookup`);
    if (shapeOf(foreign) !== shapeOf(missing))
        say(`foreign answered ${shapeOf(foreign)}, missing answered ${shapeOf(missing)}`);
    if (foreign.status !== owned.answer.status)
        say(`answered ${foreign.status}, the contract says ${owned.answer.status}`);
    if (owned.answer.code !== undefined && foreign.body?.errors?.[0]?.code !== owned.answer.code)
        say(
            `error code ${foreign.body?.errors?.[0]?.code}, the contract says ${owned.answer.code}`
        );
    if (owned.answer.emptyPage === true && (foreign.body?.items ?? ['not a page']).length > 0)
        say('the foreign id did not narrow the list to nothing');
    if (
        owned.answer.without !== undefined &&
        JSON.stringify(foreign.body).includes(owned.answer.without)
    )
        say('the foreign filter leaked the other customer’s row into the page');
    if (before !== after) say('what the caller watches changed under the attack');

    if (owned.control) {
        const own = await send(owned.control());
        if (!(owned.controlPassed?.(own) ?? own.status < 300))
            say(`the positive control with the caller's own id answered ${own.status}`);
    }
    return problems;
};
