/**
 * @module
 * A Zammad stand-in for the module's tests: a local HTTP listener that speaks the few endpoints
 * the adapter calls, keeps what it was sent, and can be told to misbehave the ways a real one does
 * (refuse, fail with a 5xx, create the ticket and lose the answer).
 *
 * It models only what the adapter relies on. Whether the real thing agrees is the job of the
 * contract suite in `src/modules/zammad/tests/real-zammad/`, which runs the same calls against a
 * booted Zammad.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** One request the stub received. */
export interface RecordedRequest {
    method: string;
    path: string;
    /** The parsed JSON body; `undefined` for a request that carried none. */
    body: Record<string, unknown> | undefined;
    /** The `Authorization` header as sent. */
    authorization: string | undefined;
    /** The `X-Zammad-Suppress-Notifications` header as sent. */
    suppressNotifications: string | undefined;
}

/** A file attached to a stub article. */
export interface StubAttachment {
    id: number;
    filename: string;
    contentType: string;
    data: Buffer;
}

/** An article of a stub ticket. */
export interface StubArticle {
    id: number;
    sender: 'Customer' | 'Agent' | 'System';
    internal: boolean;
    from?: string;
    to?: string;
    subject?: string;
    body: string;
    created_at: string;
    attachments: StubAttachment[];
}

/** What a test gives for an article: every field optional, attachments without ids. */
export type StubArticleInput = Partial<Omit<StubArticle, 'attachments'>> & {
    attachments?: Omit<StubAttachment, 'id'>[];
};

/** A ticket the stub holds. */
export interface StubTicket {
    id: number;
    customer_id: number;
    request_ref: string | null;
    body: Record<string, unknown>;
    state: string;
    tags: string[];
    created_at: string;
    last_contact_at: string | null;
    /** The customer's own last message; when unset it mirrors `last_contact_at`, as under `based_on_customer_reaction`. */
    last_contact_customer_at?: string | null;
    articles: StubArticle[];
}

/** A customer the stub holds. */
export interface StubUser {
    id: number;
    email: string;
    firstname?: string;
    lastname?: string;
    created_at: string;
    roles: string[];
}

/** A role the stub holds: its name and the group access it grants, by group id. */
export interface StubRole {
    id: number;
    name: string;
    group_ids: Record<string, string[]>;
}

/** A group the stub holds. */
export interface StubGroup {
    id: number;
    name: string;
}

/** A data-privacy task the stub holds. */
export interface StubPrivacyTask {
    id: number;
    state: 'in process' | 'completed' | 'failed';
    deletable_type: 'User' | 'Ticket';
    deletable_id: number;
}

/** How the next ticket create misbehaves, once. */
type Misbehaviour =
    /** Answer with this status and create nothing. */
    | { kind: 'refuse'; status: number }
    /** Create the ticket, then drop the connection before answering. */
    | { kind: 'lose-answer' };

/** A running stub. */
export interface ZammadStub {
    /** The `http://127.0.0.1:<port>` address to put in `NODE_ZAMMAD_URL`. */
    url: string;
    /** The token the stub accepts. */
    token: string;
    /** Every request so far, oldest first. */
    requests: RecordedRequest[];
    /** The tickets held. */
    tickets: StubTicket[];
    /** The customers held, by id. */
    users: Map<number, StubUser>;
    /** The data-privacy tasks filed so far. */
    privacyTasks: StubPrivacyTask[];
    /** The roles held, by id: the integration role starts with no group access. */
    roles: Map<number, StubRole>;
    /** The groups held, by id: the intake group `Support` and one more. */
    groups: Map<number, StubGroup>;
    /** A role update (`PUT /roles/:id`) answers 200 and changes nothing, as a Zammad that drops the grant would. */
    ignoreRoleWrites: () => void;
    /** The custom attributes the object manager holds, by name. */
    attributes: Map<string, { id: number; body: Record<string, unknown> }>;
    /** The system settings held, by key: Zammad's own default until `zammad:setup` changes it. */
    settings: Map<string, { id: number; value: unknown }>;
    /** How many times the pending-migration endpoint was called. */
    migrations: () => number;
    /** The next ticket create(s) misbehave, one entry each, then it behaves again. */
    misbehave: (...next: Misbehaviour[]) => void;
    /** Every create and ticket lookup from now on is refused with this status, until {@link ZammadStub.recover}. */
    refuseAll: (status: number) => void;
    /** A new data-privacy task (`POST /data_privacy_tasks`) is answered with this status, until `recover`. */
    refusePrivacyTasks: (status: number) => void;
    /** Undo {@link ZammadStub.refuseAll}. */
    recover: () => void;
    /** An email already held by this Zammad customer id, so a profile sync to it is refused with a 422. */
    holdAddress: (email: string, customerId: number) => void;
    /** Runs while a ticket create is being answered (after the ticket exists, when there is one): for the erasure race. */
    onCreate: (hook: (() => Promise<void>) | undefined) => void;
    /** Hold a customer, as if it already existed in Zammad. */
    addUser: (user: Partial<StubUser> & { id: number; email: string }) => StubUser;
    /** Hold a ticket, with the given articles, as if it already existed in Zammad. */
    addTicket: (ticket: {
        customerId: number;
        createdAt: string;
        lastContactAt?: string;
        state?: string;
        tags?: string[];
        title?: string;
        articles?: StubArticleInput[];
    }) => StubTicket;
    /**
     * How a new data-privacy task behaves: `completed` (the default) deletes the customer or ticket
     * at once; `in process` leaves it pending until {@link ZammadStub.finishTasks}; `failed` fails it.
     */
    privacyTaskOutcome: (state: StubPrivacyTask['state']) => void;
    /** Move every task still `in process` to `state`; a `completed` one deletes its target. */
    finishTasks: (state: 'completed' | 'failed') => void;
    /** Every request from now on is answered 503, as a Zammad that is down would. */
    goDown: () => void;
    /**
     * Make the ticket search misbehave the ways a real Zammad might: `ignoreConditions` answers
     * every ticket whatever the condition said, `ignorePaging` answers the same page for every `page`.
     */
    searchQuirks: (quirks: { ignoreConditions?: boolean; ignorePaging?: boolean }) => void;
    /** The next ticket update (`PUT /tickets/:id`) is refused with this status, once. */
    refuseNextClose: (status: number) => void;
    /** A create with `state: closed` is refused with a 422, as a Zammad that does not take it would. */
    refuseClosedCreate: () => void;
    /** Closes the listener. */
    stop: () => Promise<void>;
}

/** The token every stub accepts. */
const TOKEN = 'stub-zammad-token';

/**
 * Read a request's body as JSON.
 *
 * @param request - the incoming request
 */
const readBody = (request: IncomingMessage): Promise<Record<string, unknown> | undefined> =>
    new Promise((resolve) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            // The adapter only ever sends JSON objects.
            resolve(text ? (JSON.parse(text) as Record<string, unknown>) : undefined);
        });
    });

/**
 * Answer with a JSON body.
 *
 * @param response - the response to write
 * @param status - the HTTP status
 * @param body - what to serialise
 */
const answer = (response: ServerResponse, status: number, body: unknown): void => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
};

/**
 * Start a stub. Call it in the case or its `beforeAll`, and `stop` it after.
 *
 * @param options - `fieldsExist: false` starts a Zammad that `zammad:setup` never ran against: it
 *   holds none of our custom ticket fields, so it drops `request_ref` as the real one does
 * @returns the running stub
 */
export const startZammadStub = (options: { fieldsExist?: boolean } = {}): Promise<ZammadStub> =>
    new Promise((resolve) => {
        const requests: RecordedRequest[] = [];
        const tickets: StubTicket[] = [];
        const users = new Map<number, StubUser>();
        const privacyTasks: StubPrivacyTask[] = [];
        const roles = new Map<number, StubRole>([
            [9, { id: 9, name: 'Shop integration', group_ids: {} }]
        ]);
        const groups = new Map<number, StubGroup>([
            [1, { id: 1, name: 'Support' }],
            [2, { id: 2, name: 'Billing' }]
        ]);
        let roleWritesIgnored = false;
        const attributes = new Map<string, { id: number; body: Record<string, unknown> }>(
            options.fieldsExist === false ? [] : [['request_ref', { id: 1, body: {} }]]
        );
        const settings = new Map<string, { id: number; value: unknown }>([
            ['ticket_last_contact_behaviour', { id: 60, value: 'check_if_agent_already_replied' }]
        ]);
        /** Customer ids by address, made on first sight like `guess:` does. */
        const customers = new Map<string, number>();
        const held = new Map<string, number>();
        let nextTicketId = 100;
        let nextCustomerId = 500;
        let nextAttributeId = 900;
        let migrationCalls = 0;
        let queue: Misbehaviour[] = [];
        let refusing: number | undefined;
        let taskRefusal: number | undefined;
        let hook: (() => Promise<void>) | undefined;
        let taskOutcome: StubPrivacyTask['state'] = 'completed';
        let closedCreateRefused = false;
        let down = false;
        let quirks: { ignoreConditions?: boolean; ignorePaging?: boolean } = {};
        let closeRefusal: number | undefined;
        let nextTaskId = 40;
        let nextArticleId = 7000;
        let nextAttachmentId = 8000;

        /**
         * The customer id for a create's `customer` or `customer_id` field.
         *
         * @param body - the create body
         */
        const customerOf = (body: Record<string, unknown>): number => {
            const customer = body.customer as { id?: number } | undefined;
            if (customer?.id !== undefined) return customer.id;
            const guess = (typeof body.customer_id === 'string' ? body.customer_id : '').replace(
                /^guess:/,
                ''
            );
            const known = customers.get(guess);
            if (known !== undefined) return known;
            nextCustomerId += 1;
            customers.set(guess, nextCustomerId);
            users.set(nextCustomerId, {
                id: nextCustomerId,
                email: guess,
                created_at: new Date().toISOString(),
                roles: ['Customer']
            });
            return nextCustomerId;
        };

        /**
         * Hold an article, filling the fields a test does not care about.
         *
         * @param article - what the test gave
         */
        const makeArticle = (article: StubArticleInput): StubArticle => {
            nextArticleId += 1;
            return {
                id: nextArticleId,
                sender: 'Customer',
                internal: false,
                body: 'text',
                created_at: new Date().toISOString(),
                ...article,
                attachments: (article.attachments ?? []).map((file) => {
                    nextAttachmentId += 1;
                    return { id: nextAttachmentId, ...file };
                })
            };
        };

        /**
         * Delete what a completed data-privacy task names: the customer and their tickets, or the ticket.
         *
         * @param task - the completed task
         */
        const applyTask = (task: StubPrivacyTask): void => {
            if (task.deletable_type === 'User') {
                users.delete(task.deletable_id);
                for (let index = tickets.length - 1; index >= 0; index -= 1)
                    if (tickets[index].customer_id === task.deletable_id) tickets.splice(index, 1);
            } else {
                const index = tickets.findIndex((ticket) => ticket.id === task.deletable_id);
                if (index !== -1) tickets.splice(index, 1);
            }
        };

        /**
         * The ticket as the search and read endpoints answer it.
         *
         * @param ticket - the held ticket
         */
        const ticketView = (ticket: StubTicket) => ({
            id: ticket.id,
            customer_id: ticket.customer_id,
            number: String(ticket.id),
            title: typeof ticket.body.title === 'string' ? ticket.body.title : null,
            state: ticket.state,
            created_at: ticket.created_at,
            last_contact_at: ticket.last_contact_at,
            last_contact_customer_at:
                ticket.last_contact_customer_at === undefined
                    ? ticket.last_contact_at
                    : ticket.last_contact_customer_at,
            // A custom field comes back with every ticket, as Zammad lists it.
            request_ref: ticket.request_ref
        });

        /**
         * A customer as Zammad lists it: role names come back only for `expand=true`, so a caller
         * that forgot it sees no roles.
         *
         * @param row - the stored user
         * @param expand - whether the request asked for `expand=true`
         */
        const userView = (row: StubUser, expand: boolean) => {
            const { roles, ...plain } = row;
            return expand ? { ...plain, roles } : plain;
        };

        /** Handle `POST /api/v1/tickets`. */
        const createTicket = (
            body: Record<string, unknown>,
            response: ServerResponse
        ): Promise<void> => {
            if (body.state === 'closed' && closedCreateRefused) {
                answer(response, 422, { error: 'state closed is not allowed here' });
                return Promise.resolve();
            }
            const next = queue.shift();
            if (refusing !== undefined || next?.kind === 'refuse') {
                const status = refusing ?? (next as { status: number }).status;
                return (hook ? hook() : Promise.resolve()).then(() => {
                    answer(response, status, {});
                });
            }
            nextTicketId += 1;
            /**
             * Zammad keeps only the attributes it knows: `request_ref` comes back only after the
             * setup created it.
             */
            const known = attributes.has('request_ref');
            const ticket: StubTicket = {
                id: nextTicketId,
                customer_id: customerOf(body),
                request_ref: known ? String(body.request_ref) : null,
                body,
                state: typeof body.state === 'string' ? body.state : 'new',
                tags: [],
                created_at: new Date().toISOString(),
                last_contact_at: new Date().toISOString(),
                articles: [
                    makeArticle({
                        sender: 'Customer',
                        ...(typeof (body.article as Record<string, unknown> | undefined)?.from ===
                        'string'
                            ? { from: (body.article as { from: string }).from }
                            : {}),
                        body: (body.article as { body?: string } | undefined)?.body ?? ''
                    })
                ]
            };
            tickets.push(ticket);
            return (hook ? hook() : Promise.resolve()).then(() => {
                if (next?.kind === 'lose-answer') {
                    response.socket?.destroy();
                    return;
                }
                answer(response, 201, {
                    id: ticket.id,
                    customer_id: ticket.customer_id,
                    request_ref: ticket.request_ref
                });
            });
        };

        /** Handle `POST /api/v1/tickets/search`: `request_ref`, `customer_id`, `created_at` and `tags`. */
        const searchTickets = (body: Record<string, unknown>, response: ServerResponse): void => {
            const condition = body.condition as Record<
                string,
                { operator: string; value: unknown }
            >;
            const perPage = Number(body.per_page ?? 1000);
            const page = Number(body.page ?? 1);
            const matching = tickets.filter(
                (ticket) =>
                    quirks.ignoreConditions === true ||
                    Object.entries(condition).every(([key, { operator, value }]) => {
                        if (key === 'ticket.request_ref') return ticket.request_ref === value;
                        if (key === 'ticket.customer_id') return ticket.customer_id === value;
                        if (key === 'ticket.created_at')
                            return (
                                operator === 'before (absolute)' &&
                                ticket.created_at < String(value)
                            );
                        if (key === 'ticket.tags')
                            return (
                                operator === 'contains one' && ticket.tags.includes(String(value))
                            );
                        return false;
                    })
            );
            answer(
                response,
                200,
                matching
                    .slice(
                        ((quirks.ignorePaging ? 1 : page) - 1) * perPage,
                        (quirks.ignorePaging ? 1 : page) * perPage
                    )
                    .map((ticket) => ticketView(ticket))
            );
        };

        /** Handle `POST /api/v1/data_privacy_tasks`. */
        const fileTask = (body: Record<string, unknown>, response: ServerResponse): void => {
            const type = body.deletable_type === 'Ticket' ? 'Ticket' : 'User';
            const id = Number(body.deletable_id);
            if (
                privacyTasks.some(
                    (task) =>
                        task.deletable_type === type &&
                        task.deletable_id === id &&
                        task.state === 'in process'
                )
            ) {
                answer(response, 422, { error: 'Task already queued' });
                return;
            }
            nextTaskId += 1;
            const task: StubPrivacyTask = {
                id: nextTaskId,
                state: taskOutcome,
                deletable_type: type,
                deletable_id: id
            };
            privacyTasks.push(task);
            if (task.state === 'completed') applyTask(task);
            answer(response, 201, task);
        };

        const server: Server = createServer((request, response) => {
            readBody(request)
                .then((body) => {
                    const path = (request.url ?? '').replace(/^\/api\/v1/, '');
                    requests.push({
                        method: request.method ?? '',
                        path,
                        body,
                        authorization: request.headers.authorization,
                        suppressNotifications: request.headers[
                            'x-zammad-suppress-notifications'
                        ] as string | undefined
                    });

                    if (down) {
                        answer(response, 503, {});
                        return;
                    }
                    if (request.headers.authorization !== `Token token=${TOKEN}`) {
                        answer(response, 401, { error: 'Authentication required' });
                        return;
                    }

                    if (request.method === 'POST' && path === '/tickets') {
                        return createTicket(body ?? {}, response);
                    }
                    if (request.method === 'POST' && path === '/tickets/search') {
                        // `refuseAll` covers the lookup a retry makes before it creates.
                        if (refusing !== undefined) {
                            answer(response, refusing, {});
                            return;
                        }
                        searchTickets(body ?? {}, response);
                        return;
                    }

                    if (request.method === 'GET' && path === '/groups') {
                        answer(response, 200, [...groups.values()]);
                        return;
                    }
                    if (request.method === 'GET' && path === '/roles') {
                        answer(response, 200, [...roles.values()]);
                        return;
                    }
                    const oneRole = /^\/roles\/(\d+)$/.exec(path);
                    if (oneRole) {
                        const role = roles.get(Number(oneRole[1]));
                        if (!role) {
                            answer(response, 404, {});
                            return;
                        }
                        if (request.method === 'PUT' && !roleWritesIgnored)
                            role.group_ids = body?.group_ids as Record<string, string[]>;
                        answer(response, 200, role);
                        return;
                    }

                    if (request.method === 'POST' && path === '/data_privacy_tasks') {
                        if (taskRefusal !== undefined) {
                            answer(response, taskRefusal, {});
                            return;
                        }
                        fileTask(body ?? {}, response);
                        return;
                    }
                    const oneTask = /^\/data_privacy_tasks\/(\d+)$/.exec(path);
                    if (request.method === 'GET' && oneTask) {
                        const task = privacyTasks.find((row) => row.id === Number(oneTask[1]));
                        if (task) answer(response, 200, task);
                        else answer(response, 404, {});
                        return;
                    }
                    if (request.method === 'GET' && path.startsWith('/data_privacy_tasks?')) {
                        answer(response, 200, privacyTasks);
                        return;
                    }
                    if (request.method === 'GET' && path.startsWith('/users/search?')) {
                        const params = new URL(path, 'http://stub').searchParams;
                        const query = decodeURIComponent(params.get('query') ?? '').toLowerCase();
                        // Loose, like Zammad: a substring of the address matches.
                        answer(
                            response,
                            200,
                            [...users.values()]
                                .filter((row) => row.email.toLowerCase().includes(query))
                                .map((row) => userView(row, params.get('expand') === 'true'))
                        );
                        return;
                    }
                    if (request.method === 'GET' && path.startsWith('/users?')) {
                        const params = new URL(path, 'http://stub').searchParams;
                        const perPage = Number(params.get('per_page') ?? 100);
                        const page = quirks.ignorePaging ? 1 : Number(params.get('page') ?? 1);
                        answer(
                            response,
                            200,
                            [...users.values()]
                                .slice((page - 1) * perPage, page * perPage)
                                .map((row) => userView(row, params.get('expand') === 'true'))
                        );
                        return;
                    }
                    const oneUser = /^\/users\/(\d+)(\?.*)?$/.exec(path);
                    if (request.method === 'GET' && oneUser) {
                        const row = users.get(Number(oneUser[1]));
                        if (row)
                            answer(
                                response,
                                200,
                                userView(row, (oneUser[2] ?? '').includes('expand=true'))
                            );
                        else answer(response, 404, { error: "Couldn't find User" });
                        return;
                    }
                    const articles = /^\/ticket_articles\/by_ticket\/(\d+)/.exec(path);
                    if (request.method === 'GET' && articles) {
                        const ticket = tickets.find((row) => row.id === Number(articles[1]));
                        answer(
                            response,
                            200,
                            (ticket?.articles ?? []).map((article) => ({
                                ...article,
                                type: 'web',
                                attachments: article.attachments.map((file) => ({
                                    id: file.id,
                                    filename: file.filename,
                                    size: String(file.data.byteLength),
                                    preferences: { 'Mime-Type': file.contentType }
                                }))
                            }))
                        );
                        return;
                    }
                    const file = /^\/ticket_attachment\/(\d+)\/(\d+)\/(\d+)$/.exec(path);
                    if (request.method === 'GET' && file) {
                        const found = tickets
                            .find((row) => row.id === Number(file[1]))
                            ?.articles.find((article) => article.id === Number(file[2]))
                            ?.attachments.find((attachment) => attachment.id === Number(file[3]));
                        if (!found) {
                            answer(response, 404, {});
                            return;
                        }
                        response.writeHead(200, { 'Content-Type': found.contentType });
                        response.end(found.data);
                        return;
                    }
                    const tagsRead = /^\/tags\?object=Ticket&o_id=(\d+)$/.exec(path);
                    if (request.method === 'GET' && tagsRead) {
                        const ticket = tickets.find((row) => row.id === Number(tagsRead[1]));
                        answer(response, 200, { tags: ticket?.tags ?? [] });
                        return;
                    }
                    if (request.method === 'POST' && path === '/tags/add') {
                        const ticket = tickets.find((row) => row.id === Number(body?.o_id));
                        ticket?.tags.push(String(body?.item));
                        answer(response, 200, true);
                        return;
                    }
                    const ticketUpdate = /^\/tickets\/(\d+)$/.exec(path);
                    if (request.method === 'PUT' && ticketUpdate && closeRefusal !== undefined) {
                        const status = closeRefusal;
                        closeRefusal = undefined;
                        answer(response, status, {});
                        return;
                    }
                    if (request.method === 'PUT' && ticketUpdate) {
                        const ticket = tickets.find((row) => row.id === Number(ticketUpdate[1]));
                        if (ticket && typeof body?.state === 'string') ticket.state = body.state;
                        answer(response, 200, { id: Number(ticketUpdate[1]) });
                        return;
                    }

                    const user = /^\/users\/(\d+)$/.exec(path);
                    if (request.method === 'PUT' && user) {
                        const holder = held.get(String(body?.email));
                        if (holder !== undefined && holder !== Number(user[1])) {
                            answer(response, 422, { error: 'Email address is already used' });
                            return;
                        }
                        answer(response, 200, { id: Number(user[1]) });
                        return;
                    }

                    if (request.method === 'GET' && path === '/settings') {
                        answer(
                            response,
                            200,
                            [...settings].map(([name, { id, value }]) => ({
                                id,
                                name,
                                state_current: { value }
                            }))
                        );
                        return;
                    }
                    const setting = /^\/settings\/(\d+)$/.exec(path);
                    if (request.method === 'PUT' && setting) {
                        const row = [...settings.values()].find(
                            ({ id }) => id === Number(setting[1])
                        );
                        if (!row) {
                            answer(response, 404, { error: 'Setting not found' });
                            return;
                        }
                        const next = body?.state_current;
                        row.value =
                            typeof next === 'object' && next !== null && 'value' in next
                                ? next.value
                                : undefined;
                        answer(response, 200, { id: row.id });
                        return;
                    }
                    if (request.method === 'GET' && path === '/object_manager_attributes') {
                        answer(
                            response,
                            200,
                            [...attributes].map(([name, { id }]) => ({
                                id,
                                name,
                                object: 'Ticket'
                            }))
                        );
                        return;
                    }
                    if (request.method === 'POST' && path === '/object_manager_attributes') {
                        nextAttributeId += 1;
                        attributes.set(String(body?.name), {
                            id: nextAttributeId,
                            body: body ?? {}
                        });
                        answer(response, 201, { id: nextAttributeId });
                        return;
                    }
                    const attribute = /^\/object_manager_attributes\/(\d+)$/.exec(path);
                    if (request.method === 'PUT' && attribute) {
                        attributes.set(String(body?.name), {
                            id: Number(attribute[1]),
                            body: body ?? {}
                        });
                        answer(response, 200, { id: Number(attribute[1]) });
                        return;
                    }
                    if (
                        request.method === 'POST' &&
                        path === '/object_manager_attributes_execute_migrations'
                    ) {
                        migrationCalls += 1;
                        answer(response, 200, {});
                        return;
                    }
                    answer(response, 404, { error: 'The stub does not know this endpoint' });
                })
                .catch(() => {
                    // A hook that rejected: the caller sees a dropped connection, as from a crashed Zammad.
                    response.destroy();
                });
        });

        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                url: `http://127.0.0.1:${String(port)}`,
                token: TOKEN,
                requests,
                tickets,
                users,
                privacyTasks,
                roles,
                groups,
                ignoreRoleWrites: () => {
                    roleWritesIgnored = true;
                },
                attributes,
                settings,
                migrations: () => migrationCalls,
                misbehave: (...next) => {
                    queue = [...next];
                },
                refuseAll: (status) => {
                    refusing = status;
                },
                recover: () => {
                    refusing = undefined;
                    taskRefusal = undefined;
                },
                refusePrivacyTasks: (status) => {
                    taskRefusal = status;
                },
                holdAddress: (email, customerId) => {
                    held.set(email, customerId);
                },
                onCreate: (next) => {
                    hook = next;
                },
                addUser: (user) => {
                    const row: StubUser = {
                        created_at: new Date().toISOString(),
                        roles: ['Customer'],
                        ...user
                    };
                    users.set(row.id, row);
                    return row;
                },
                addTicket: (ticket) => {
                    nextTicketId += 1;
                    const row: StubTicket = {
                        id: nextTicketId,
                        customer_id: ticket.customerId,
                        request_ref: null,
                        body: { title: ticket.title ?? 'Seeded' },
                        state: ticket.state ?? 'open',
                        tags: ticket.tags ?? [],
                        created_at: ticket.createdAt,
                        last_contact_at: ticket.lastContactAt ?? ticket.createdAt,
                        articles: (ticket.articles ?? [{}]).map((article) => makeArticle(article))
                    };
                    tickets.push(row);
                    return row;
                },
                privacyTaskOutcome: (state) => {
                    taskOutcome = state;
                },
                finishTasks: (state) => {
                    for (const task of privacyTasks.filter((row) => row.state === 'in process')) {
                        task.state = state;
                        if (state === 'completed') applyTask(task);
                    }
                },
                searchQuirks: (next) => {
                    quirks = next;
                },
                refuseNextClose: (status) => {
                    closeRefusal = status;
                },
                goDown: () => {
                    down = true;
                },
                refuseClosedCreate: () => {
                    closedCreateRefused = true;
                },
                stop: () =>
                    new Promise<void>((done) => {
                        server.closeAllConnections();
                        server.close(() => done());
                    })
            });
        });
    });
