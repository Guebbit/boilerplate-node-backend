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
}

/** A ticket the stub holds. */
export interface StubTicket {
    id: number;
    customer_id: number;
    request_ref: string | null;
    body: Record<string, unknown>;
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
    /** The tickets created so far. */
    tickets: StubTicket[];
    /** The custom attributes the object manager holds, by name. */
    attributes: Map<string, { id: number; body: Record<string, unknown> }>;
    /** How many times the pending-migration endpoint was called. */
    migrations: () => number;
    /** The next ticket create(s) misbehave, one entry each, then it behaves again. */
    misbehave: (...next: Misbehaviour[]) => void;
    /** Every create from now on is refused with this status, until {@link ZammadStub.recover}. */
    refuseAll: (status: number) => void;
    /** Undo {@link ZammadStub.refuseAll}. */
    recover: () => void;
    /** An email already held by this Zammad customer id, so a profile sync to it is refused with a 422. */
    holdAddress: (email: string, customerId: number) => void;
    /** Runs while a ticket create is being answered (after the ticket exists, when there is one): for the erasure race. */
    onCreate: (hook: (() => Promise<void>) | undefined) => void;
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
        const attributes = new Map<string, { id: number; body: Record<string, unknown> }>(
            options.fieldsExist === false ? [] : [['request_ref', { id: 1, body: {} }]]
        );
        /** Customer ids by address, made on first sight like `guess:` does. */
        const customers = new Map<string, number>();
        const held = new Map<string, number>();
        let nextTicketId = 100;
        let nextCustomerId = 500;
        let nextAttributeId = 900;
        let migrationCalls = 0;
        let queue: Misbehaviour[] = [];
        let refusing: number | undefined;
        let hook: (() => Promise<void>) | undefined;

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
            return nextCustomerId;
        };

        /** Handle `POST /api/v1/tickets`. */
        const createTicket = (
            body: Record<string, unknown>,
            response: ServerResponse
        ): Promise<void> => {
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
                body
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

        /** Handle `POST /api/v1/tickets/search` over `request_ref`. */
        const searchTickets = (body: Record<string, unknown>, response: ServerResponse): void => {
            const condition = body.condition as Record<string, { value: string }>;
            const wanted = condition['ticket.request_ref'].value;
            answer(
                response,
                200,
                tickets
                    .filter((ticket) => ticket.request_ref === wanted)
                    .map((ticket) => ({ id: ticket.id, customer_id: ticket.customer_id }))
            );
        };

        const server: Server = createServer((request, response) => {
            readBody(request)
                .then((body) => {
                    const path = (request.url ?? '').replace(/^\/api\/v1/, '');
                    requests.push({
                        method: request.method ?? '',
                        path,
                        body,
                        authorization: request.headers.authorization
                    });

                    if (request.headers.authorization !== `Token token=${TOKEN}`) {
                        answer(response, 401, { error: 'Authentication required' });
                        return;
                    }

                    if (request.method === 'POST' && path === '/tickets') {
                        return createTicket(body ?? {}, response);
                    }
                    if (request.method === 'POST' && path === '/tickets/search') {
                        searchTickets(body ?? {}, response);
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
                attributes,
                migrations: () => migrationCalls,
                misbehave: (...next) => {
                    queue = [...next];
                },
                refuseAll: (status) => {
                    refusing = status;
                },
                recover: () => {
                    refusing = undefined;
                },
                holdAddress: (email, customerId) => {
                    held.set(email, customerId);
                },
                onCreate: (next) => {
                    hook = next;
                },
                stop: () =>
                    new Promise<void>((done) => {
                        server.closeAllConnections();
                        server.close(() => done());
                    })
            });
        });
    });
