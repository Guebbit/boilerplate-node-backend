/**
 * Every status the error interpreter can answer is a status the contract describes.
 *
 * `databaseErrorInterpreter` answers **422 `Invalid identifier`** for a Mongoose `CastError` and
 * again for a `BSONError` — which is what a malformed id produces, on any operation that takes
 * one. Mongo has no such failure to report: a malformed ObjectId is a perfectly valid string that
 * matches no row, so the rejection happens before the query and belongs to the id, not to the
 * collection.
 *
 * That makes 422 a property of the PARAMETER rather than of the endpoint, and the contract has to
 * say so on all of them or on none. Four operations said nothing — `GET /products/{id}`,
 * `GET /orders/{id}`, `GET /orders/{id}/invoice`, `GET /users/{id}` — while the twenty-five beside
 * them did, so the same request shape was documented two different ways depending on which route
 * received it.
 *
 * ── Why this is worth a test rather than a fix ────────────────────────────────────────────────
 * The contract is a SHARED file: `openapi.yaml` is bundled from these fragments and must stay
 * byte-identical with the paired frontend and with the PHP twin, and the frontend's client is
 * generated from it. An undeclared status is not a cosmetic gap — it is a response the generated
 * client has no type for and the twin's response-schema suite will refuse. And the way it arrives
 * is always the same: a new endpoint takes an id and copies the responses from whichever neighbour
 * happened to be missing them.
 *
 * ── Read from the fragments, not the bundle ───────────────────────────────────────────────────
 * The bundle is generated. A failure there names a line nobody edits, and the fix is in a fragment
 * the message would not mention.
 *
 * ── Scope: 422 only ───────────────────────────────────────────────────────────────────────────
 * The same sweep over 500 reports three operations — `GET /account`,
 * `GET /observability/events`, `GET /observability/metrics` — and they are NOT asserted here.
 * Whether each is an omission or a deliberate shape is a question about those endpoints, and
 * answering it means editing a file that must move in three repositories at once. Recorded rather
 * than enforced, so this file states one rule it can defend instead of two it cannot.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** The HTTP methods an operation object may be keyed by. */
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/**
 * A path templated on an id — `{id}`, `{orderId}`, `{userId}`.
 *
 * Matched on the parameter NAME rather than on a list of routes, because that is the actual
 * trigger: the interpreter answers 422 for whatever it failed to cast, and every one of these
 * carries a value it will try to.
 */
const TAKES_AN_ID = /{[^}]*[Ii]d}/;

interface Operation {
    module: string;
    route: string;
    method: string;
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

const takingAnId = () => operations().filter(({ route }) => TAKES_AN_ID.test(route));

describe('declared error responses', () => {
    it('finds the operations it means to check', () => {
        // A canary: a renamed fragment or a changed path shape would leave every case below
        // sweeping an empty list, which passes and proves nothing.
        expect(operations().length).toBeGreaterThan(40);
        expect(takingAnId().length).toBeGreaterThanOrEqual(20);
    });

    it('declares 422 on every operation that takes an id', () => {
        /*
         * The one the four were missing. `databaseErrorInterpreter` can answer it on any of these,
         * so an operation that omits it describes an API that cannot fail the way this one does.
         */
        const undeclared = takingAnId()
            .filter(({ codes }) => !codes.includes('422'))
            .map(
                ({ module, method, route }) =>
                    `${module}: ${method.toUpperCase()} ${route} — a malformed id answers 422, and this says it cannot`
            );

        expect(undeclared).toEqual([]);
    });
});
