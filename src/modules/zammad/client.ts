/**
 * @module
 * The Zammad adapter: the only file that speaks HTTP to it. `fetch` with a hard timeout, a Zod
 * parse on every answer, and one error type that says whether the outcome is unknown. Never called
 * inside a request: the hand-over and the profile sync call it from a sweep.
 *
 * Not traced: `fetch` is not instrumented, so no URL or customer address reaches a span.
 * The URL is the operator's own internal address, so there is no SSRF guard here (that guard is
 * for a URL a caller supplies).
 *
 * @see docs/modules/zammad.md#the-hand-over
 */

import { z } from 'zod';
import { readCappedJson } from '@infrastructure/http/read-capped-body';
import { zammadSettings, type ZammadSettings } from './config';

/** Zammad answers are small; a longer body is not one of its answers. */
const RESPONSE_CAP_BYTES = 1_048_576;

/** The longest we wait for Zammad. The whole call, so a stalled one never holds a sweep. */
const TIMEOUT_MS = 5000;

/**
 * A call that did not succeed. `unclear` is what the retry logic needs: when `true`, Zammad may have
 * done the work (a timeout, a 5xx, a 429, an answer we could not read), so a create must look the
 * ticket up before it is sent again; when `false`, Zammad refused it and nothing happened.
 */
export class ZammadRequestError extends Error {
    /** Whether the work may have been done. */
    readonly unclear: boolean;

    /** The HTTP status, absent for a call that never got an answer. */
    readonly status?: number;

    /**
     * @param message - what happened, never carrying the request body
     * @param unclear - whether the work may have been done
     * @param status - the HTTP status, when there was an answer
     */
    constructor(message: string, unclear: boolean, status?: number) {
        super(message);
        this.name = 'ZammadRequestError';
        this.unclear = unclear;
        this.status = status;
    }
}

/** A created ticket as Zammad answers: our own `request_ref` field comes back only after setup ran. */
const ticketAnswer = z.object({
    id: z.number(),
    customer_id: z.number(),
    request_ref: z.string().nullish()
});

/** The ticket Zammad made: its id, its customer, and whether our `request_ref` field was kept. */
export interface CreatedTicket {
    id: number;
    /** The Zammad customer the ticket belongs to. */
    customerId: number;
    /** Whether the answer carries our `request_ref` back: `false` means `zammad:setup` never ran. */
    refKept: boolean;
}

/** A search answer: a list of tickets, of which only the ids matter. */
const searchAnswer = z.array(z.object({ id: z.number(), customer_id: z.number() }));

/**
 * One call to Zammad.
 *
 * `fetch` options: https://developer.mozilla.org/docs/Web/API/fetch. `signal` bounds the call;
 * `redirect: 'error'` refuses to follow a redirect to a host nobody chose.
 * `Authorization: Token token=…` is Zammad's HTTP token scheme.
 * https://docs.zammad.org/en/latest/api/intro.html#authentication
 *
 * @param settings - where Zammad is and the token to use
 * @param method - the HTTP verb
 * @param path - the path under `/api/v1`
 * @param body - the JSON body, for a write; `undefined` sends none
 * @param schema - what the answer must look like
 * @throws {ZammadRequestError} on a timeout, a refusal, or an answer that does not fit `schema`
 */
export const callZammad = <T>(
    settings: ZammadSettings,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body: unknown,
    schema: z.ZodType<T>
): Promise<T> =>
    fetch(`${settings.url}/api/v1${path}`, {
        method,
        headers: {
            Authorization: `Token token=${settings.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error'
    }).then(
        (response) => {
            if (!response.ok) {
                // 5xx and 429: Zammad may have started the work. Any other refusal did nothing.
                const unclear = response.status >= 500 || response.status === 429;
                const refuse = (): never => {
                    throw new ZammadRequestError(
                        `Zammad answered ${String(response.status)}`,
                        unclear,
                        response.status
                    );
                };
                // Drain the body so the socket frees; its text is never logged (it can echo input).
                return (response.body ? response.body.cancel() : Promise.resolve()).then(
                    refuse,
                    refuse
                );
            }
            return readCappedJson(response, RESPONSE_CAP_BYTES).then(
                (json) => {
                    const parsed = schema.safeParse(json);
                    if (parsed.success) return parsed.data;
                    // An answer we cannot read after a 2xx: the work was done as far as we know.
                    throw new ZammadRequestError('Zammad answered something unexpected', true);
                },
                () => {
                    throw new ZammadRequestError('Zammad answered something unreadable', true);
                }
            );
        },
        (error: unknown) => {
            throw new ZammadRequestError(
                error instanceof Error ? `Zammad call failed: ${error.name}` : 'Zammad call failed',
                true
            );
        }
    );

/** Escape the five characters that matter in HTML, so the visitor's words stay text. */
const escapeHtml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

/** What a ticket needs from a contact message. */
export interface TicketRequest {
    /** The Zammad customer: its id when the account is mapped, else the address (Zammad finds or makes it). */
    customer: { id: number } | { email: string };
    name?: string;
    subject: string;
    message: string;
    category?: string;
    orderNumber?: string;
    /** Whether the typed address is the signed-in account's verified one. */
    senderVerified: boolean;
    /** The pending row's id: the dedup stamp. */
    requestRef: string;
    /** A link to the shop account in our admin, for a verified sender. */
    accountLink?: string;
}

/**
 * The display name of a sender in an article's `from`: letters and spaces only, so the visitor's
 * free text never puts a quote, angle bracket or control character into an address-like field.
 */
const safeName = (name: string): string => name.replaceAll(/[^\p{L}\p{N} .'-]/gu, '').trim();

/**
 * Create the ticket: one `web` article from the customer, our fields beside it. The create is one
 * transaction in Zammad: there is no empty ticket to clean up after a failure.
 *
 * `customer: {id}` for a mapped account; `customer_id: "guess:<email>"` otherwise, which Zammad
 * resolves to the customer with that address, creating it when there is none.
 *
 * @param request - the message and its custom fields
 * @throws {ZammadRequestError} when the call fails
 */
export const createTicket = (request: TicketRequest): Promise<CreatedTicket> => {
    const settings = zammadSettings();
    if (!settings) return Promise.reject(new ZammadRequestError('Zammad is not configured', false));

    const email = 'email' in request.customer ? request.customer.email : undefined;
    const from = request.name && email ? `${safeName(request.name)} <${email}>` : email;

    return callZammad(
        settings,
        'POST',
        '/tickets',
        {
            title: request.subject,
            group: settings.group,
            ...('id' in request.customer
                ? { customer: { id: request.customer.id } }
                : { customer_id: `guess:${request.customer.email}` }),
            article: {
                subject: request.subject,
                body: escapeHtml(request.message).replaceAll('\n', '<br>'),
                content_type: 'text/html',
                type: 'web',
                internal: false,
                sender: 'Customer',
                ...(from ? { from } : {})
            },
            ...(request.category ? { shop_category: request.category } : {}),
            ...(request.orderNumber ? { order_number: request.orderNumber } : {}),
            shop_sender_verified: request.senderVerified,
            request_ref: request.requestRef,
            ...(request.accountLink ? { shop_account: request.accountLink } : {})
        },
        ticketAnswer
    ).then((ticket) => ({
        id: ticket.id,
        customerId: ticket.customer_id,
        refKept: ticket.request_ref === request.requestRef
    }));
};

/**
 * Look a ticket up by our `request_ref`, before a create is sent again after an unclear outcome.
 * A `condition` search with no `query`: plain SQL in Zammad, exact and current with or without
 * Elasticsearch.
 *
 * @param requestRef - the pending row's id
 * @returns the ticket already filed under it, or `undefined`
 * @throws {ZammadRequestError} when the call fails
 */
export const findTicketByRef = (requestRef: string): Promise<CreatedTicket | undefined> => {
    const settings = zammadSettings();
    if (!settings) return Promise.reject(new ZammadRequestError('Zammad is not configured', false));

    return callZammad(
        settings,
        'POST',
        '/tickets/search',
        { condition: { 'ticket.request_ref': { operator: 'is', value: requestRef } }, limit: 1 },
        searchAnswer
    ).then((found) => {
        const ticket = found.at(0);
        return ticket
            ? { id: ticket.id, customerId: ticket.customer_id, refKept: true }
            : undefined;
    });
};

/**
 * Overwrite a customer's address with the account's current one. The address is all we send:
 * Zammad accepts a user with an email alone, and a name is data it does not need.
 *
 * @param zammadUserId - the mapped Zammad customer
 * @param email - the account's current address
 * @throws {ZammadRequestError} when the call fails; a 422 is Zammad refusing the address because
 *   another customer already holds it
 */
export const updateCustomer = (zammadUserId: number, email: string): Promise<void> => {
    const settings = zammadSettings();
    if (!settings) return Promise.reject(new ZammadRequestError('Zammad is not configured', false));

    return callZammad(
        settings,
        'PUT',
        `/users/${String(zammadUserId)}`,
        { email },
        z.object({ id: z.number() })
    ).then(() => undefined);
};
