/**
 * @module
 * What the three real-Zammad suites share: where the booted Zammad is, a typed door for the calls
 * only the suites make (admin setup, articles with files, the online notifications of a watching
 * agent), and the environment that points the module at it.
 *
 * Needs `NODE_TEST_ZAMMAD_URL`, `NODE_TEST_ZAMMAD_TOKEN` (the integration user's token, with
 * `ticket.agent` and `admin.data_privacy`) and `NODE_TEST_ZAMMAD_ADMIN_TOKEN` (an Admin's). An unset
 * variable FAILS the run: a skipped contract suite reads as a green one.
 *
 * @see docs/modules/zammad.md#testing
 */

import { z } from 'zod';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { setEnvironment } from '@tests/environment';
import { enabledModules } from '../../../../modules';
import { callZammad, ZammadRequestError } from '../../client';
import type { ZammadSettings } from '../../config';

/** The group the suites file their tickets in: Zammad's stock group. */
const GROUP = process.env.NODE_TEST_ZAMMAD_GROUP ?? 'Users';

/**
 * Read a required variable, failing loudly when it is not there.
 *
 * @param name - the variable
 * @throws {Error} when it is unset
 */
const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set: this suite needs a booted Zammad.`);
    return value;
};

/** Where the booted Zammad is and the two tokens the suites act with. */
export interface RealZammad {
    url: string;
    /** The integration user's token: what the module itself runs with. */
    token: string;
    /** An Admin's token: field setup, settings and throwaway users. */
    adminToken: string;
    group: string;
}

/**
 * The booted Zammad's coordinates, read from the environment.
 *
 * @throws {Error} when a variable is unset
 */
export const realZammad = (): RealZammad => ({
    url: required('NODE_TEST_ZAMMAD_URL'),
    token: required('NODE_TEST_ZAMMAD_TOKEN'),
    adminToken: required('NODE_TEST_ZAMMAD_ADMIN_TOKEN'),
    group: GROUP
});

/**
 * The adapter's own settings object for one of the two tokens.
 *
 * @param zammad - the booted Zammad
 * @param as - which token to act with
 */
export const settingsFor = (zammad: RealZammad, as: 'integration' | 'admin'): ZammadSettings => ({
    url: zammad.url,
    token: as === 'admin' ? zammad.adminToken : zammad.token,
    group: zammad.group
});

/**
 * Point the module at the booted Zammad, the way a deployment's `NODE_ZAMMAD_*` variables do.
 *
 * @param zammad - the booted Zammad
 */
export const pointModuleAt = (zammad: RealZammad): void => {
    setEnvironment({
        NODE_ZAMMAD_URL: zammad.url,
        NODE_ZAMMAD_API_TOKEN: zammad.token,
        NODE_ZAMMAD_GROUP: zammad.group,
        NODE_SUPPORT_EMAIL: 'desk@example.com'
    });
};

/** Register the modules, so the hand-over port and the erasure hook are installed. */
export const registerAllModules = (): void => {
    resetDomainEvents();
    registerModules(enabledModules);
};

/** A user as Zammad answers a create. */
const createdUser = z.object({ id: z.number() });

/**
 * Make a Zammad user through the admin token.
 *
 * @param zammad - the booted Zammad
 * @param email - the address
 * @param role - the Zammad role
 * @returns its id
 */
export const makeUser = (
    zammad: RealZammad,
    email: string,
    role: 'Customer' | 'Agent' = 'Customer'
): Promise<number> =>
    callZammad(
        settingsFor(zammad, 'admin'),
        'POST',
        '/users',
        { email, firstname: 'Real', lastname: 'Zammad', roles: [role] },
        createdUser
    ).then(({ id }) => id);

/**
 * The HTTP status Zammad answers a read with: 200 when it answers, the refusal's status otherwise.
 * An attachment whose ticket is gone answers 500, a ticket or user answers 404: the suites check
 * "not 200", never one particular refusal.
 *
 * @param read - the call
 */
export const statusOf = (read: Promise<unknown>): Promise<number | undefined> =>
    read.then(
        () => 200,
        (error: unknown) => (error instanceof ZammadRequestError ? error.status : undefined)
    );

/** A ticket as the suites read it back. */
const ticketRead = z.object({
    id: z.number(),
    customer_id: z.number(),
    state: z.string().nullish(),
    group_id: z.number().optional(),
    request_ref: z.string().nullish(),
    shop_category: z.string().nullish(),
    order_number: z.string().nullish(),
    shop_sender_verified: z.boolean().nullish(),
    shop_account: z.string().nullish(),
    last_contact_at: z.string().nullish(),
    last_contact_customer_at: z.string().nullish(),
    first_response_escalation_at: z.string().nullish(),
    created_at: z.string()
});

/** What the suites read of a ticket. */
export type TicketRead = z.infer<typeof ticketRead>;

/**
 * Read one ticket with the integration user's token.
 *
 * @param zammad - the booted Zammad
 * @param id - Zammad's own id of the ticket, as `createTicket` returns it
 */
export const readTicket = (zammad: RealZammad, id: number): Promise<TicketRead> =>
    callZammad(
        settingsFor(zammad, 'integration'),
        'GET',
        `/tickets/${String(id)}?expand=true`,
        undefined,
        ticketRead
    );

/**
 * When the ticket's last contact was, as Zammad measures it: the clock the retention pass reads.
 *
 * @param zammad - the booted Zammad
 * @param id - Zammad's own id of the ticket
 */
export const lastContactOf = (zammad: RealZammad, id: number): Promise<string | null | undefined> =>
    readTicket(zammad, id).then(({ last_contact_at: lastContact }) => lastContact);

/** One file for an article: Zammad takes it as base64 with its media type. */
export interface FileUpload {
    filename: string;
    text: string;
    mimeType: string;
}

/** Where an article comes from, and whether staff only may see it. */
export interface ArticleInput {
    sender: 'Customer' | 'Agent';
    internal: boolean;
    body: string;
    files?: FileUpload[];
}

/** An article as Zammad answers a create. */
const createdArticle = z.object({ id: z.number() });

/**
 * Add an article to a ticket with the integration user's token.
 *
 * @param zammad - the booted Zammad
 * @param ticketId - Zammad's own id of the ticket to write to
 * @param input - who writes it, whether it is internal, and the files it carries
 * @returns the article's id
 */
export const addArticle = (
    zammad: RealZammad,
    ticketId: number,
    input: ArticleInput
): Promise<number> =>
    callZammad(
        settingsFor(zammad, 'integration'),
        'POST',
        '/ticket_articles',
        {
            ticket_id: ticketId,
            subject: 'Real Zammad',
            body: input.body,
            type: input.sender === 'Customer' ? 'web' : 'note',
            sender: input.sender,
            internal: input.internal,
            ...(input.files
                ? {
                      attachments: input.files.map((file) => ({
                          filename: file.filename,
                          data: Buffer.from(file.text).toString('base64'),
                          'mime-type': file.mimeType
                      }))
                  }
                : {})
        },
        createdArticle
    ).then(({ id }) => id);

/** A throwaway agent that watches the group, so a notification has someone to reach. */
export interface Watcher {
    email: string;
    password: string;
}

/**
 * Make an agent with full access to the group (Zammad's group id 1 is the stock `Users`) and a
 * known password, so its own online notifications can be read.
 *
 * @param zammad - the booted Zammad
 * @param run - a short id that keeps the address unique
 */
export const makeWatcher = (zammad: RealZammad, run: string): Promise<Watcher> => {
    const watcher = { email: `watcher-${run}@example.com`, password: `Watcher-Pass-${run}-2026` };
    return callZammad(
        settingsFor(zammad, 'admin'),
        'POST',
        '/users',
        {
            login: watcher.email,
            email: watcher.email,
            firstname: 'Watching',
            lastname: 'Agent',
            password: watcher.password,
            roles: ['Agent'],
            group_ids: { 1: ['full'] }
        },
        createdUser
    ).then(() => watcher);
};

/**
 * How many online notifications the watcher has: Zammad's in-app bell, one row per event it was
 * told about. Basic auth, because a token cannot read another user's notifications.
 *
 * @param zammad - the booted Zammad
 * @param watcher - the agent
 */
export const notificationsOf = (zammad: RealZammad, watcher: Watcher): Promise<number> =>
    fetch(`${zammad.url}/api/v1/online_notifications`, {
        headers: {
            Authorization: `Basic ${Buffer.from(`${watcher.email}:${watcher.password}`).toString('base64')}`
        },
        signal: AbortSignal.timeout(10_000)
    })
        .then((response) => response.json())
        .then((rows) => z.array(z.unknown()).parse(rows).length);

/**
 * The watcher's notification count once it has stopped moving: Zammad makes notifications in a
 * background job, so a count read right after a create is a count still on its way up.
 *
 * @param zammad - the booted Zammad
 * @param watcher - the agent
 * @param quietMs - how long the count must hold still
 */
export const notificationsSettled = async (
    zammad: RealZammad,
    watcher: Watcher,
    quietMs = 5000
): Promise<number> => {
    let count = await notificationsOf(zammad, watcher);
    for (;;) {
        await pause(quietMs);
        const next = await notificationsOf(zammad, watcher);
        if (next === count) return count;
        count = next;
    }
};

/**
 * Wait a moment, for the effects Zammad runs in a background job after it answers.
 *
 * @param ms - how long
 */
export const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
