/**
 * `eslint.config.ts`'s "side effects belong to the service layer" `no-restricted-imports` block,
 * checked LIVE against the real flat config through the `eslint` binary — the same reason
 * `no-factories-import-in-production.test.ts` does it that way.
 *
 * Against REAL files under `src/modules/users/`, briefly: `parserOptions.project` resolves
 * against the physical TypeScript program.
 */
import { execFile } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@tests/paths';

/** The eslint binary the probe is run with. */
const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'eslint');

/** The probe files: a controller (covered) and a service-layer file that must stay allowed. */
const CONTROLLER_PROBE = 'src/modules/users/controllers/__side-effect-probe.ts';

/** Path of the probe service file. */
const SERVICE_PROBE = 'src/modules/users/__side-effect-probe.ts';

/** The probe file's source: imports the four calls, then uses them so nothing is unused. */
const PROBE_SOURCE = `import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { recordAudit } from '@infrastructure/observability/audit';
import { emitAnalyticsEvent } from '@infrastructure/observability/analytics';
import { emitDomainEvent } from '@kernel/events';
void [enqueueEmail, recordAudit, emitAnalyticsEvent, emitDomainEvent];
`;

/** One run of the real `eslint` CLI on a file, `--format json` parsed back into its messages. */
const lintFile = (
    relativePath: string,
    source: string
): Promise<{ ruleId: string | null; message: string }[]> =>
    new Promise((resolve, reject) => {
        writeFileSync(path.join(REPO_ROOT, relativePath), source);
        execFile(
            ESLINT_BIN,
            ['--format', 'json', '--no-warn-ignored', relativePath],
            { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 10_000_000 },
            // A finding exits non-zero, which is the case under test — only a parse failure of
            // eslint's own JSON output is a real error here.
            (_error, stdout) => {
                try {
                    resolve(JSON.parse(stdout)[0]?.messages ?? []);
                } catch (parseError) {
                    reject(
                        parseError instanceof Error ? parseError : new Error(String(parseError))
                    );
                }
            }
        );
    });

describe('the four side-effect calls are not importable outside the service layer', () => {
    afterEach(() => {
        rmSync(path.join(REPO_ROOT, CONTROLLER_PROBE), { force: true });
        rmSync(path.join(REPO_ROOT, SERVICE_PROBE), { force: true });
    });

    it('refuses all four in a controller', async () => {
        const messages = await lintFile(CONTROLLER_PROBE, PROBE_SOURCE);

        const refused = messages.filter((message) => message.ruleId === 'no-restricted-imports');
        expect(refused).toHaveLength(4);
    });

    it('allows them in a service-layer file', async () => {
        const messages = await lintFile(SERVICE_PROBE, PROBE_SOURCE);

        expect(messages.filter((message) => message.ruleId === 'no-restricted-imports')).toEqual(
            []
        );
    });
});
