/**
 * `docker/backup/common.sh` — how the heartbeat token is read from `BACKUP_HEARTBEAT_TOKEN_FILE`.
 *
 * The rule is `secret-files.ts`'s: the file wins when it holds anything, one trailing newline is
 * dropped, an empty file leaves the plain variable standing, and a named file that cannot be read
 * stops the job. The script is sourced by real bash, because what it does with `set -e` is the
 * point: the unreadable case must end the process, not log and carry on.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The script under test, by absolute path. */
const COMMON = path.resolve(__dirname, '../../../../docker/backup/common.sh');

/** Where this case's token files live. */
let sandbox: string;

beforeEach(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'backup-secret-'));
});

afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
});

/**
 * Sources `common.sh` in bash and prints the resolved token between bars, so a trailing newline
 * would show.
 *
 * @param variables - the environment the script reads
 */
const resolveToken = (variables: Record<string, string>) =>
    spawnSync('bash', ['-c', `source "${COMMON}"; printf '|%s|' "$HEARTBEAT_TOKEN"`], {
        env: { PATH: process.env.PATH ?? '', ...variables },
        encoding: 'utf8'
    });

/**
 * Writes a token file and returns its path.
 *
 * @param content - the exact bytes
 */
const tokenFile = (content: string): string => {
    const file = path.join(sandbox, 'token');
    writeFileSync(file, content);
    return file;
};

describe('BACKUP_HEARTBEAT_TOKEN_FILE', () => {
    it('is read, and wins over the plain variable', () => {
        const result = resolveToken({
            BACKUP_HEARTBEAT_TOKEN: 'plain',
            BACKUP_HEARTBEAT_TOKEN_FILE: tokenFile('from-a-file')
        });

        expect(result.stdout).toBe('|from-a-file|');
    });

    it('drops exactly one trailing newline, and not a second', () => {
        const result = resolveToken({ BACKUP_HEARTBEAT_TOKEN_FILE: tokenFile('token\n\n') });

        expect(result.stdout).toBe('|token\n|');
    });

    it('drops a CRLF line ending as one newline', () => {
        const result = resolveToken({ BACKUP_HEARTBEAT_TOKEN_FILE: tokenFile('token\r\n') });

        expect(result.stdout).toBe('|token|');
    });

    it('leaves the plain variable standing when the file is empty', () => {
        const result = resolveToken({
            BACKUP_HEARTBEAT_TOKEN: 'plain',
            BACKUP_HEARTBEAT_TOKEN_FILE: tokenFile('')
        });

        expect(result.stdout).toBe('|plain|');
    });

    it('stops the job, naming the file, when it is missing — the plain variable does not stand in', () => {
        const missing = path.join(sandbox, 'absent');

        const result = resolveToken({
            BACKUP_HEARTBEAT_TOKEN: 'plain',
            BACKUP_HEARTBEAT_TOKEN_FILE: missing
        });

        expect(result.status).not.toBe(0);
        expect(result.stdout).toContain(missing);
        expect(result.stdout).not.toContain('|plain|');
    });
});
