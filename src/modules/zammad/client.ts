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
import { readCappedBytes, readCappedJson } from '@infrastructure/http/read-capped-body';
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
 * @param options - `headers`: extra request headers; `capBytes`: a longer answer cap, for the calls
 *   whose answers are not small (a ticket's articles)
 * @throws {ZammadRequestError} on a timeout, a refusal, or an answer that does not fit `schema`
 */
export const callZammad = <T>(
    settings: ZammadSettings,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    options: { headers?: Record<string, string>; capBytes?: number } = {}
): Promise<T> =>
    fetch(`${settings.url}/api/v1${path}`, {
        method,
        headers: {
            Authorization: `Token token=${settings.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...options.headers
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
            return readCappedJson(response, options.capBytes ?? RESPONSE_CAP_BYTES).then(
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
    /**
     * The email check refused the address: the ticket is filed closed, tagged
     * {@link SPAM_TAG}, with Zammad's notifications suppressed.
     */
    suspectedSpam?: boolean;
}

/**
 * The display name of a sender in an article's `from`: letters and spaces only, so the visitor's
 * free text never puts a quote, angle bracket or control character into an address-like field.
 */
const safeName = (name: string): string => name.replaceAll(/[^\p{L}\p{N} .'-]/gu, '').trim();

/**
 * Re-throw a failure of a step that runs AFTER the ticket exists as unclear, whatever Zammad said:
 * the retry must find the ticket by its `request_ref`, never file a second one.
 *
 * @param message - what could not be done
 * @returns the handler for a rejected call
 */
const unclearAfterCreate =
    (message: string) =>
    (error: unknown): never => {
        throw new ZammadRequestError(
            message,
            true,
            error instanceof ZammadRequestError ? error.status : undefined
        );
    };

/**
 * Tag a created spam ticket. Any failure is unclear (see {@link unclearAfterCreate}).
 *
 * @param settings - where Zammad is
 * @param ticket - the ticket that exists
 */
export const markSpam = (settings: ZammadSettings, ticket: CreatedTicket): Promise<CreatedTicket> =>
    addTicketTag(settings, ticket.id, SPAM_TAG).then(
        () => ticket,
        unclearAfterCreate('The spam ticket exists but could not be tagged')
    );

/**
 * Finish a spam ticket an earlier unclear attempt left behind: close it, then tag it. The lost
 * attempt may have died between the create and either step. Closing a closed ticket and tagging a
 * tagged one change nothing, so this is safe to repeat.
 *
 * @param settings - where Zammad is
 * @param ticket - the ticket that exists
 */
export const finishSpamTicket = (
    settings: ZammadSettings,
    ticket: CreatedTicket
): Promise<CreatedTicket> =>
    closeTicket(settings, ticket.id)
        .catch(unclearAfterCreate('The spam ticket exists but could not be closed'))
        .then(() => markSpam(settings, ticket));

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

    const body = {
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
    };

    /** One create call; `closed` files the ticket already closed. */
    const create = (closed: boolean): Promise<CreatedTicket> =>
        callZammad(
            settings,
            'POST',
            '/tickets',
            closed ? { ...body, state: 'closed' } : body,
            ticketAnswer,
            // Suspected spam must not mail anyone: a header Zammad reads on the API call.
            request.suspectedSpam ? { headers: { 'X-Zammad-Suppress-Notifications': 'true' } } : {}
        ).then((ticket) => ({
            id: ticket.id,
            customerId: ticket.customer_id,
            refKept: ticket.request_ref === request.requestRef
        }));

    if (!request.suspectedSpam) return create(false);

    /**
     * Created closed when Zammad takes `state: closed` on create; when it refuses that (a 4xx), the
     * ticket is created open and closed in a second call. Either way it is then tagged. A failure
     * after the ticket exists is reported as unclear, so the retry looks the ticket up first.
     */
    return create(true)
        .catch((error: unknown) => {
            if (error instanceof ZammadRequestError && !error.unclear)
                return create(false).then((ticket) =>
                    closeTicket(settings, ticket.id)
                        .catch(unclearAfterCreate('The spam ticket exists but could not be closed'))
                        .then(() => ticket)
                );
            throw error;
        })
        .then((ticket) => markSpam(settings, ticket));
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

/** A Zammad customer as the export and the retention pass read it. */
const userAnswer = z.object({
    id: z.number(),
    email: z.string().nullish(),
    firstname: z.string().nullish(),
    lastname: z.string().nullish(),
    created_at: z.string().nullish(),
    /** Role names, present when the call asks for `expand=true`. */
    roles: z.array(z.string()).optional()
});

/** What the module reads of a Zammad customer. */
export type ZammadUser = z.infer<typeof userAnswer>;

/**
 * Read one customer.
 *
 * @param settings - where Zammad is
 * @param zammadUserId - the customer
 * @returns the customer, or `undefined` when Zammad has none by that id (it is already gone)
 * @throws {ZammadRequestError} for any other failure
 */
export const getUser = (
    settings: ZammadSettings,
    zammadUserId: number
): Promise<ZammadUser | undefined> =>
    callZammad(settings, 'GET', `/users/${String(zammadUserId)}`, undefined, userAnswer).catch(
        (error: unknown) => {
            if (error instanceof ZammadRequestError && error.status === 404) return undefined;
            throw error;
        }
    );

/** The most customers one address lookup reads: an address belongs to one customer, the rest is slack. */
const ADDRESS_LOOKUP_LIMIT = 20;

/**
 * Find the customers whose address is exactly `email`. Zammad's search matches loosely, so the
 * answer is filtered to the exact address, case-insensitively.
 *
 * @param settings - where Zammad is
 * @param email - the normalised address
 * @throws {ZammadRequestError} when the call fails
 */
export const findUsersByEmail = (settings: ZammadSettings, email: string): Promise<ZammadUser[]> =>
    callZammad(
        settings,
        'GET',
        `/users/search?query=${encodeURIComponent(email)}&limit=${String(ADDRESS_LOOKUP_LIMIT)}`,
        undefined,
        z.array(userAnswer)
    ).then((users) => users.filter((user) => user.email?.toLowerCase() === email.toLowerCase()));

/** One page of customers, role names included. */
export const USERS_PAGE_SIZE = 100;

/**
 * List customers a page at a time, for the retention pass.
 *
 * @param settings - where Zammad is
 * @param page - 1-based page
 * @throws {ZammadRequestError} when the call fails
 */
export const listUsers = (settings: ZammadSettings, page: number): Promise<ZammadUser[]> =>
    callZammad(
        settings,
        'GET',
        `/users?expand=true&page=${String(page)}&per_page=${String(USERS_PAGE_SIZE)}`,
        undefined,
        z.array(userAnswer)
    );

/** A data-privacy task as Zammad answers: its id, what it deletes and where it stands. */
const privacyTaskAnswer = z.object({
    id: z.number(),
    state: z.string(),
    deletable_type: z.string(),
    deletable_id: z.number()
});

/** Where a data-privacy task stands, in the three words we act on. */
export interface PrivacyTask {
    id: number;
    state: 'in_process' | 'completed' | 'failed';
}

/**
 * Narrow Zammad's state text (`in process`, `completed`, `failed`) to the three states we act on.
 * Anything unknown reads as still in process: waiting is the safe misreading, and the stuck alert
 * catches a state that never moves.
 *
 * @param answer - the task as Zammad sent it
 */
const privacyTaskOf = (answer: z.infer<typeof privacyTaskAnswer>): PrivacyTask => ({
    id: answer.id,
    state:
        answer.state === 'completed'
            ? 'completed'
            : answer.state === 'failed'
              ? 'failed'
              : 'in_process'
});

/**
 * Ask Zammad to delete a customer or a ticket and everything that hangs on it: Zammad's own
 * Data Privacy task, the documented door. https://docs.zammad.org/en/latest/api/data-privacy.html
 *
 * @param settings - where Zammad is
 * @param deletableType - what to delete
 * @param deletableId - its Zammad id
 * @returns the task; `'queued'` when Zammad answers 422 because a task for it already exists
 * @throws {ZammadRequestError} for any other failure
 */
export const fileDataPrivacyTask = (
    settings: ZammadSettings,
    deletableType: 'User' | 'Ticket',
    deletableId: number
): Promise<PrivacyTask | 'queued'> =>
    callZammad(
        settings,
        'POST',
        '/data_privacy_tasks',
        { deletable_type: deletableType, deletable_id: deletableId },
        privacyTaskAnswer
    ).then(
        (task) => privacyTaskOf(task),
        (error: unknown) => {
            if (error instanceof ZammadRequestError && error.status === 422) return 'queued';
            throw error;
        }
    );

/**
 * Read one task.
 *
 * @param settings - where Zammad is
 * @param taskId - Zammad's id of the data-privacy task
 * @returns the task, or `undefined` when Zammad has none by that id
 * @throws {ZammadRequestError} for any other failure
 */
export const getDataPrivacyTask = (
    settings: ZammadSettings,
    taskId: number
): Promise<PrivacyTask | undefined> =>
    callZammad(
        settings,
        'GET',
        `/data_privacy_tasks/${String(taskId)}`,
        undefined,
        privacyTaskAnswer
    ).then(
        (task) => privacyTaskOf(task),
        (error: unknown) => {
            if (error instanceof ZammadRequestError && error.status === 404) return undefined;
            throw error;
        }
    );

/** Pages of the task list the "already queued" lookup reads before giving up. */
const TASK_LIST_PAGES = 20;

/**
 * Find the task already filed for a customer or ticket, after a 422 said one exists.
 *
 * @param settings - where Zammad is
 * @param deletableType - what the task deletes
 * @param deletableId - its Zammad id
 * @returns the newest task for it, or `undefined` when none is listed
 * @throws {ZammadRequestError} when the call fails
 */
export const findDataPrivacyTask = async (
    settings: ZammadSettings,
    deletableType: 'User' | 'Ticket',
    deletableId: number
): Promise<PrivacyTask | undefined> => {
    for (let page = 1; page <= TASK_LIST_PAGES; page += 1) {
        const tasks = await callZammad(
            settings,
            'GET',
            `/data_privacy_tasks?page=${String(page)}&per_page=${String(USERS_PAGE_SIZE)}`,
            undefined,
            z.array(privacyTaskAnswer)
        );
        const found = tasks.findLast(
            (task) => task.deletable_type === deletableType && task.deletable_id === deletableId
        );
        if (found) return privacyTaskOf(found);
        if (tasks.length < USERS_PAGE_SIZE) return undefined;
    }
    return undefined;
};

/** A ticket as the export and the retention pass read it. */
const ticketRow = z.object({
    id: z.number(),
    customer_id: z.number(),
    number: z.string().nullish(),
    title: z.string().nullish(),
    state: z.string().nullish(),
    created_at: z.string().nullish(),
    last_contact_at: z.string().nullish()
});

/** What the module reads of a Zammad ticket. */
export type ZammadTicket = z.infer<typeof ticketRow>;

/** Tickets per search page. */
export const TICKETS_PAGE_SIZE = 100;

/**
 * One page of the tickets that match a condition. A `condition` search is plain SQL in Zammad,
 * exact and current with or without Elasticsearch.
 *
 * @param settings - where Zammad is
 * @param condition - Zammad's search condition object
 * @param page - 1-based page
 * @throws {ZammadRequestError} when the call fails
 */
export const searchTickets = (
    settings: ZammadSettings,
    condition: Record<string, unknown>,
    page: number
): Promise<ZammadTicket[]> =>
    callZammad(
        settings,
        'POST',
        '/tickets/search',
        { condition, expand: true, page, per_page: TICKETS_PAGE_SIZE },
        z.array(ticketRow)
    );

/**
 * Every ticket that matches a condition, page by page until a short page. A FULL page that brings
 * no ticket not seen before means Zammad ignored `page`: the list cannot be completed, so this
 * throws rather than return a part of it (an incomplete export must never look complete).
 *
 * @param settings - where Zammad is
 * @param condition - Zammad's search condition object
 * @throws {ZammadRequestError} when a call fails, or Zammad does not page
 */
export const searchAllTickets = async (
    settings: ZammadSettings,
    condition: Record<string, unknown>
): Promise<ZammadTicket[]> => {
    const found = new Map<number, ZammadTicket>();
    for (let page = 1; ; page += 1) {
        const rows = await searchTickets(settings, condition, page);
        const before = found.size;
        for (const row of rows) found.set(row.id, row);
        if (rows.length < TICKETS_PAGE_SIZE) return [...found.values()];
        if (found.size === before)
            throw new ZammadRequestError('Zammad does not page its ticket search', false);
    }
};

/** An article, with the attachments it carries listed. */
const articleRow = z.object({
    id: z.number(),
    type: z.string().nullish(),
    sender: z.string().nullish(),
    internal: z.boolean().nullish(),
    from: z.string().nullish(),
    to: z.string().nullish(),
    cc: z.string().nullish(),
    subject: z.string().nullish(),
    body: z.string().nullish(),
    content_type: z.string().nullish(),
    created_at: z.string().nullish(),
    attachments: z
        .array(
            z.object({
                id: z.number(),
                filename: z.string().nullish(),
                size: z.union([z.string(), z.number()]).nullish(),
                preferences: z.record(z.string(), z.unknown()).nullish()
            })
        )
        .optional()
});

/** What the module reads of a ticket's article. */
export type ZammadArticle = z.infer<typeof articleRow>;

/** The most bytes of article text one ticket may answer with: a long mail thread is not small. */
const ARTICLES_CAP_BYTES = 32 * 1_048_576;

/**
 * Every article of a ticket, internal notes included.
 *
 * @param settings - where Zammad is
 * @param ticketId - Zammad's id of the ticket
 * @throws {ZammadRequestError} when the call fails
 */
export const listArticles = (
    settings: ZammadSettings,
    ticketId: number
): Promise<ZammadArticle[]> =>
    callZammad(
        settings,
        'GET',
        `/ticket_articles/by_ticket/${String(ticketId)}?expand=true`,
        undefined,
        z.array(articleRow),
        { capBytes: ARTICLES_CAP_BYTES }
    );

/** The longest an attachment download may take. */
const ATTACHMENT_TIMEOUT_MS = 60_000;

/** The largest attachment the export carries; a larger one fails the export rather than shrinking it. */
const ATTACHMENT_CAP_BYTES = 50 * 1_048_576;

/**
 * Download one attachment's bytes.
 *
 * @param settings - where Zammad is
 * @param ticketId - Zammad's id of the ticket
 * @param articleId - Zammad's id of the article
 * @param attachmentId - Zammad's id of the file
 * @throws {ZammadRequestError} when the call fails or the file is over the cap
 */
export const downloadAttachment = (
    settings: ZammadSettings,
    ticketId: number,
    articleId: number,
    attachmentId: number
): Promise<Buffer> =>
    fetch(
        `${settings.url}/api/v1/ticket_attachment/${String(ticketId)}/${String(articleId)}/${String(attachmentId)}`,
        {
            headers: { Authorization: `Token token=${settings.token}` },
            signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS),
            redirect: 'error'
        }
    ).then(
        (response) => {
            if (!response.ok || !response.body) {
                throw new ZammadRequestError(
                    `Zammad answered ${String(response.status)}`,
                    response.status >= 500 || response.status === 429,
                    response.status
                );
            }
            return readCappedBytes(response.body as AsyncIterable<unknown>, ATTACHMENT_CAP_BYTES);
        },
        (error: unknown) => {
            throw new ZammadRequestError(
                error instanceof Error ? `Zammad call failed: ${error.name}` : 'Zammad call failed',
                true
            );
        }
    );

/** The tag a suspected-spam ticket carries, and the view in Zammad staff use to find them. */
export const SPAM_TAG = 'suspected-spam';

/**
 * Tag a ticket. Adding a tag it already has is a no-op in Zammad, so a retry is safe.
 *
 * @param settings - where Zammad is
 * @param ticketId - Zammad's id of the ticket
 * @param tag - the tag text
 * @throws {ZammadRequestError} when the call fails
 */
export const addTicketTag = (
    settings: ZammadSettings,
    ticketId: number,
    tag: string
): Promise<void> =>
    callZammad(
        settings,
        'POST',
        '/tags/add',
        { object: 'Ticket', o_id: ticketId, item: tag },
        z.unknown()
    ).then(() => undefined);

/**
 * The tags a ticket carries, read back: the check before a deletion that rests on a tag.
 *
 * @param settings - where Zammad is
 * @param ticketId - Zammad's id of the ticket
 * @throws {ZammadRequestError} when the call fails
 */
export const getTicketTags = (settings: ZammadSettings, ticketId: number): Promise<string[]> =>
    callZammad(
        settings,
        'GET',
        `/tags?object=Ticket&o_id=${String(ticketId)}`,
        undefined,
        z.array(z.string())
    );

/**
 * Close a ticket.
 *
 * @param settings - where Zammad is
 * @param ticketId - Zammad's id of the ticket
 * @throws {ZammadRequestError} when the call fails
 */
export const closeTicket = (settings: ZammadSettings, ticketId: number): Promise<void> =>
    callZammad(
        settings,
        'PUT',
        `/tickets/${String(ticketId)}`,
        { state: 'closed' },
        z.object({ id: z.number() })
    ).then(() => undefined);
