/**
 * The `names-in-us-english-*` Spectral rules: a machine-read name (operationId, schema, property,
 * enum value, error-code key, channel, message) in a British spelling is refused; prose is free.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/** `execFile` without blocking the event loop — the CLI takes a second to start. */
const run = promisify(execFile);

/** The scratch folders this file made, removed after each case. */
const scratch: string[] = [];

afterEach(() => Promise.all(scratch.splice(0).map((folder) => rm(folder, { recursive: true }))));

/** The repo root, where the rulesets and the local Spectral binary live. */
const ROOT = path.join(__dirname, '..', '..', '..', '..');

/** The local Spectral binary — the same one the `lint:*` scripts run. */
const SPECTRAL = path.join(ROOT, 'node_modules', '.bin', 'spectral');

/**
 * Lint one scratch document and report the codes and JSON paths of the spelling findings.
 *
 * @param ruleset - ruleset file, relative to `shared/contracts`
 * @param document - the YAML text of the document to lint
 * @returns `code path` for every `names-in-us-english-*` finding
 */
const spellingFindings = async (ruleset: string, document: string): Promise<string[]> => {
    const folder = await mkdtemp(path.join(tmpdir(), 'us-names-rule-'));
    scratch.push(folder);
    const file = path.join(folder, 'document.yaml');
    await writeFile(file, document);

    /**
     * Spectral CLI: `--format json` prints the findings as an array. It exits non-zero on an
     * error-severity finding; the rejection still carries `stdout`, and other findings on this
     * scratch document are not what is asked about, so the exit code is not read.
     */
    const { stdout } = await run(
        SPECTRAL,
        [
            'lint',
            '--ruleset',
            path.join(ROOT, 'shared', 'contracts', ruleset),
            '--format',
            'json',
            file
        ],
        { encoding: 'utf8' }
    ).catch((error: { stdout: string }) => error);
    /**
     * With nothing to report the CLI prints `[]` and then a plain-text summary line: the JSON is
     * everything before that line break, or the whole output when findings span several lines.
     */
    const json = stdout.startsWith('[]') ? '[]' : stdout;
    const findings = JSON.parse(json) as { code: string; path: string[] }[];
    return findings
        .filter(({ code }) => code.startsWith('names-in-us-english'))
        .map(({ code, path: p }) => `${code} ${p.join('.')}`);
};

/** An OpenAPI fragment whose names are the given ones. */
const openapi = (names: {
    operationId: string;
    schema: string;
    property: string;
    enumValue: string;
    code: string;
}) =>
    `openapi: 3.1.0
info: { title: t, version: '1' }
x-error-codes:
  ${names.code}: { status: 409, description: 'The order was cancelled.' }
paths:
  /things:
    get:
      operationId: ${names.operationId}
      summary: A cancelled thing
      responses: { '200': { description: ok } }
components:
  schemas:
    ${names.schema}:
      type: object
      properties:
        ${names.property}: { type: string, enum: [${names.enumValue}] }
`;

describe('names-in-us-english (OpenAPI)', () => {
    it('refuses a British spelling in every machine-read name, and leaves prose alone', async () => {
        const flagged = await spellingFindings(
            'spectral.modules.yaml',
            openapi({
                operationId: 'getCatalogueFacets',
                schema: 'CancellableThing',
                property: 'cancelledAt',
                enumValue: 'cancelled',
                code: 'ORDER_NOT_CANCELLED'
            })
        );

        expect(flagged.map((finding) => finding.split(' ', 1)[0]).toSorted()).toEqual([
            'names-in-us-english-enum-values',
            'names-in-us-english-error-codes',
            'names-in-us-english-operation-ids',
            'names-in-us-english-properties',
            'names-in-us-english-schema-names'
        ]);
    });

    it('accepts the US spellings, and a stem that merely ends in -is-like letters', async () => {
        const flagged = await spellingFindings(
            'spectral.modules.yaml',
            openapi({
                operationId: 'getCatalogFacets',
                schema: 'CancelableThing',
                property: 'promisedAt',
                enumValue: 'canceled',
                code: 'ORDER_NOT_CANCELED'
            })
        );

        expect(flagged).toEqual([]);
    });
});

describe('names-in-us-english (AsyncAPI)', () => {
    it('refuses a British spelling in a channel, a message and a schema name', async () => {
        const flagged = await spellingFindings(
            'spectral.asyncapi.names.yaml',
            `asyncapi: 3.0.0
info: { title: t, version: '1' }
channels:
  order.cancelled:
    address: order.cancelled
    messages:
      OrderCancelledEvent: { $ref: '#/components/messages/OrderCancelledEvent' }
components:
  messages:
    OrderCancelledEvent: { name: OrderCancelledEvent, payload: { $ref: '#/components/schemas/OrderCancelledPayload' } }
  schemas:
    OrderCancelledPayload: { type: object }
`
        );

        expect(flagged.map((finding) => finding.split(' ', 1)[0])).toEqual(
            expect.arrayContaining([
                'names-in-us-english-channels',
                'names-in-us-english-messages',
                'names-in-us-english-schemas'
            ])
        );
    });

    it('accepts the US spellings', async () => {
        const flagged = await spellingFindings(
            'spectral.asyncapi.names.yaml',
            `asyncapi: 3.0.0
info: { title: t, version: '1' }
channels:
  order.canceled:
    address: order.canceled
components:
  schemas:
    OrderCanceledPayload: { type: object }
`
        );

        expect(flagged).toEqual([]);
    });
});
