/**
 * Every status the id rule can answer is a status the contract describes.
 *
 * Why:       a malformed id in a URL path is the same 404 an unknown id gets (`requireId`), so 404
 *            belongs to the PARAMETER, not the endpoint: every operation with an id in its path
 *            must say so. The contract is shared byte for byte with the paired frontend and the PHP
 *            twin; an undeclared status is a response their generated types lack.
 * Source:    the fragments, not the generated bundle: a failure there names a line nobody edits.
 * Scope:     the 404 on a path id, and the codes a guard makes. The 422 on a body or query id is
 *            `tests/integration/malformed-ids.test.ts`. `GET /account`, `GET /observability/events`
 *            and `GET /observability/metrics` are NOT asserted: whether each is an omission or a
 *            deliberate shape is for those endpoints to answer, in a file shared by three repos.
 * Codes:     an operation's `x-error-codes` lists what it can send. Four checks hold it true:
 *            - every catalogue code not `scope: app` is on at least one operation;
 *            - every guard-made code is on every route mounting the guard, read off the route
 *              table, the permission rules and the kernel's own questions (never a second list);
 *            - the permission names in an operation's security scopes match what its guards ask,
 *              both ways;
 *            - `tests/support/response-contract.ts` fails any HTTP test whose answer carries a
 *              code its operation does not list (service codes only a test can see).
 *
 * @see docs/understand/request-flow.md#a-malformed-id-has-one-answer-per-position
 * @see docs/reference/errors.md#the-errors-extension
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { MODULES_ROOT } from '@tests/paths';
import { everyMountedRoute, type MountedRoute } from '@tests/contract-routes';
import { errorCodeIndex, listOperations, readSpec } from '@tests/spec-walk';
import {
    PRESET_ROLES,
    callerForSubject,
    findRule,
    ruleId,
    staffRoleWithheld
} from '@kernel/permissions';
import { holds } from '@kernel/ability';
import { asStub } from '@tests/stub';
import type { AuthContext } from '@types';

jest.mock('@kernel/middlewares/authorizations', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').authGuardsMock()
);

/** The HTTP methods an operation object may be keyed by. */
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/**
 * A path templated on an id — `{id}`, `{orderId}`, `{userId}`.
 *
 * Matched on the parameter NAME rather than on a list of routes, because that is the actual
 * trigger: every one of these carries a value `requireId` may refuse.
 */
const TAKES_AN_ID = /\{[^}]*[Ii]d\}/;

/** An operation: its route and the errors it declares. */
interface Operation {
    /** The module whose route this is. */
    module: string;
    /** The route's path. */
    route: string;
    /** The route's verb. */
    method: string;
    /** Error codes its guards can answer. */
    codes: string[];
}

/** Every operation declared by every module's contract fragment. */
const operations = (): Operation[] =>
    readdirSync(MODULES_ROOT)
        .map((module) => ({ module, file: path.join(MODULES_ROOT, module, 'openapi.yaml') }))
        .filter(({ file }) => existsSync(file))
        .flatMap(({ module, file }) => {
            const document = YAML.parse(readFileSync(file, 'utf8')) as {
                paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
            };

            return Object.entries(document.paths ?? {}).flatMap(([route, item]) =>
                Object.entries(item)
                    .filter(([method]) => METHODS.has(method))
                    .map(([method, operation]) => ({
                        module,
                        route,
                        method,
                        codes: Object.keys(operation.responses ?? {})
                    }))
            );
        });

/** Operations whose route takes an id. */
const takingAnId = () => operations().filter(({ route }) => TAKES_AN_ID.test(route));

describe('declared error responses', () => {
    it('finds the operations it means to check', () => {
        /**
         * A canary: a renamed fragment or a changed path shape would leave every case below
         * sweeping an empty list, which passes and proves nothing.
         */
        expect(operations().length).toBeGreaterThan(40);
        expect(takingAnId().length).toBeGreaterThanOrEqual(20);
    });

    it('declares 404 on every operation that takes an id in its path', () => {
        /**
         * A malformed id answers as an unknown one, so an operation that omits the 404 describes an
         * API that cannot fail the way this one does.
         */
        const undeclared = takingAnId()
            .filter(({ codes }) => !codes.includes('404'))
            .map(
                ({ module, method, route }) =>
                    `${module}: ${method.toUpperCase()} ${route} — a malformed id answers 404, and this says it cannot`
            );

        expect(undeclared).toEqual([]);
    });
});

/** The 401 a step-up guard answers. */
const REAUTH = 'REAUTH_REQUIRED';

/** The 403 an unenrolled staff member gets where their role would have held the rule. */
const ENROLLMENT = 'SECOND_FACTOR_ENROLLMENT_REQUIRED';

/**
 * Whether the guard sends {@link ENROLLMENT} on this ask: some preset role, withheld for want of
 * an authenticator app, would hold the rule once enrolled and does not hold it through its
 * audience. The same pair `wouldHoldOnceEnrolled` asks (`kernel/middlewares/authorizations.ts`),
 * through the kernel's exported helpers, so `IMPLIED_BY` is honoured as in the guard.
 */
const sendsEnrollment = (action: never, subject: never): boolean =>
    PRESET_ROLES.some((role) =>
        [true, false].some((verified) => {
            const context = asStub<AuthContext>({
                id: 'sweep',
                tenantId: 'sweep',
                verified,
                authenticatorArmed: false,
                roles: {
                    tenant: role.scope === 'tenant' ? role.name : null,
                    platform: role.scope === 'platform' ? role.name : null
                }
            });
            const enrolled = { ...context, authenticatorArmed: true };

            return (
                staffRoleWithheld(context) &&
                holds(callerForSubject(enrolled, subject), action, subject) &&
                !holds(callerForSubject(context, subject), action, subject)
            );
        })
    );

/** A code one route's guards oblige its operation to list, under a status. */
interface Obligation {
    /** The HTTP status the code is answered under. */
    status: string;
    /** The error code the operation must list. */
    code: string;
}

/** What one mounted route's guards oblige its operation to list. */
const obligationsOf = (route: MountedRoute): Obligation[] => {
    const obliged: Obligation[] = [];

    if (route.guards.some((guard) => /^requireFreshAuth(?:When)?\(/.test(guard)))
        obliged.push({ status: '401', code: REAUTH });

    for (const ask of route.permissions) {
        const rule = findRule(ruleId(ask.action, ask.subject));
        if (rule?.stepUp) obliged.push({ status: '401', code: REAUTH });
        if (rule?.deniedCode) obliged.push({ status: '403', code: rule.deniedCode });
        // `never`: the ask came from a `requirePermission` mount the guard already typed.
        if (sendsEnrollment(ask.action as never, ask.subject as never))
            obliged.push({ status: '403', code: ENROLLMENT });
    }

    return obliged;
};

/** `GET /products/:id` mounted → `GET /products/{id}` as the spec spells it. */
const specKey = (route: MountedRoute): string =>
    `${route.method} ${route.path.replaceAll(/:(\w+)/g, '{$1}').replace(/\/$/, '')}`;

describe('declared error codes', () => {
    const index = errorCodeIndex();
    const listed = new Set(
        Object.values(index.listed).flatMap((byStatus) => Object.values(byStatus).flat())
    );

    /**
     * The codes the idempotency middleware answers. The catalogue is the root contract's, so it
     * keeps them in a deployment where no operation takes the header (no module that moves money
     * or stock): with nothing to answer from, there is nothing to list them on.
     */
    const IDEMPOTENCY_CODES = new Set(['IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_OUTCOME_UNKNOWN']);
    const someOperationTakesAKey = listOperations().some((operation) =>
        operation.requiredHeaders.some((name) => name.toLowerCase() === 'idempotency-key')
    );

    it('lists every catalogue code that is not app-wide on at least one operation', () => {
        const orphans = index.catalogue.filter(
            (code) =>
                !index.appScoped.has(code) &&
                !listed.has(code) &&
                (!IDEMPOTENCY_CODES.has(code) || someOperationTakesAKey)
        );

        expect(orphans).toEqual([]);
    });

    it('lists every guard-made code on every operation whose route mounts the guard', () => {
        const idOf = new Map(
            listOperations().map((operation) => [
                `${operation.method.toUpperCase()} ${operation.path}`,
                operation.operationId
            ])
        );
        const routes = everyMountedRoute();
        // A route matching no operation fails: skipping it would let the sweep shrink silently.
        const unmatched = routes.map((route) => specKey(route)).filter((key) => !idOf.has(key));
        const missing = routes.flatMap((route) =>
            obligationsOf(route)
                .filter(({ status, code }) => {
                    const operationId = idOf.get(specKey(route));
                    return !(index.listed[operationId ?? '']?.[status] ?? []).includes(code);
                })
                .map(({ status, code }) => `${specKey(route)}: ${status} ${code}`)
        );

        expect({ unmatched, missing: [...new Set(missing)] }).toEqual({
            unmatched: [],
            missing: []
        });
    });

    it('names on each operation the permissions its route guards ask, and no others', () => {
        const spec = readSpec();
        /** Every credential alternative of an operation that can carry a permission, as its names. */
        const alternativesOf = (key: string): string[][] => {
            const [method = '', path = ''] = key.split(' ', 2);
            const security = (
                spec.paths[path]?.[method] as { security?: Record<string, string[]>[] } | undefined
            )?.security;
            return (security ?? []).flatMap((alternative) =>
                ['bearerAuth', 'apiKeyAuth'].flatMap((scheme) =>
                    scheme in alternative ? [[...(alternative[scheme] ?? [])].toSorted()] : []
                )
            );
        };
        const guarded = new Map(
            everyMountedRoute().map((route) => [
                specKey(route).replace(/^\w+/, (method) => method.toLowerCase()),
                route.permissions.map(({ action, subject }) => ruleId(action, subject)).toSorted()
            ])
        );

        const mismatches = [...guarded].flatMap(([key, asked]) =>
            alternativesOf(key)
                .filter((named) => named.join(',') !== asked.join(','))
                .map(
                    (named) =>
                        `${key}: contract [${named.join(', ')}] vs guard [${asked.join(', ')}]`
                )
        );
        // Both ways: a name on an operation no mounted guard asks it of is a stale entry.
        const orphaned = listOperations()
            .map((operation) => `${operation.method} ${operation.path}`)
            .filter(
                (key) => !guarded.has(key) && alternativesOf(key).some((named) => named.length > 0)
            );

        expect({ mismatches, orphaned }).toEqual({ mismatches: [], orphaned: [] });
    });

    it('finds guard-made codes to hold the lists against', () => {
        // A canary: a renamed guard label would leave the sweep above requiring nothing.
        const codes = everyMountedRoute().flatMap((route) =>
            obligationsOf(route).map(({ code }) => code)
        );

        expect(codes).toEqual(expect.arrayContaining([REAUTH, ENROLLMENT]));
    });
});
