/**
 * `scripts/pairing/paired-frontend-path.ts` — which frontend every pairing script means.
 *
 * The order is the whole contract: the shell, then `.env`, then the sibling default.
 * `.env` is the case worth guarding: `npm run` never loads it, so the resolver reads it itself.
 * An empty value is the other: every `.env` copied from `.env-example` declares `FRONTEND_PATH =`.
 *
 * Each case runs against a throwaway working directory, so this checkout's own `.env` never leaks in.
 *
 * Mirrors `<paired-frontend>/tests/unit/scripts/pairing/paired-backend-path.spec.ts`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    DEFAULT_FRONTEND_PATH,
    resolveFrontendPath
} from '../../../../scripts/pairing/paired-frontend-path';
import { setProcessEnvironment } from '@tests/environment';

/** The throwaway working directory of the current case. */
let workingDirectory: string;

/**
 * Writes the working directory's `.env`.
 *
 * @param contents - the file's full text
 */
const writeEnvironmentFile = (contents: string): void => {
    writeFileSync(path.join(workingDirectory, '.env'), contents);
};

/** Where the sibling default lands from the current working directory. */
const sibling = (): string => path.resolve(workingDirectory, DEFAULT_FRONTEND_PATH);

beforeEach(() => {
    workingDirectory = mkdtempSync(path.join(tmpdir(), 'paired-frontend-path-'));
    jest.spyOn(process, 'cwd').mockReturnValue(workingDirectory);
    setProcessEnvironment({ FRONTEND_PATH: undefined });
});

afterEach(() => {
    jest.restoreAllMocks();
    rmSync(workingDirectory, { recursive: true, force: true });
});

describe('resolveFrontendPath', () => {
    it('falls back to the sibling checkout with no shell value and no .env', () => {
        expect(resolveFrontendPath()).toBe(sibling());
    });

    it('reads FRONTEND_PATH from .env, which npm run never loads', () => {
        writeEnvironmentFile('FRONTEND_PATH=/srv/lanes/frontend-worktree\n');

        expect(resolveFrontendPath()).toBe('/srv/lanes/frontend-worktree');
    });

    it('lets the shell win over .env, so a one-off run needs no file edit', () => {
        writeEnvironmentFile('FRONTEND_PATH=/srv/lanes/from-file\n');
        setProcessEnvironment({ FRONTEND_PATH: '/srv/lanes/from-shell' });

        expect(resolveFrontendPath()).toBe('/srv/lanes/from-shell');
    });

    it('treats an empty shell value as unset, and reads .env instead', () => {
        writeEnvironmentFile('FRONTEND_PATH=/srv/lanes/from-file\n');
        setProcessEnvironment({ FRONTEND_PATH: '   ' });

        expect(resolveFrontendPath()).toBe('/srv/lanes/from-file');
    });

    it("treats .env-example's empty declaration as unset, rather than as this repo", () => {
        writeEnvironmentFile('FRONTEND_PATH=\nNODE_PORT=3000\n');

        expect(resolveFrontendPath()).toBe(sibling());
        expect(resolveFrontendPath()).not.toBe(workingDirectory);
    });

    it('resolves a relative value against the working directory', () => {
        writeEnvironmentFile('FRONTEND_PATH=../frontend-worktree\n');

        expect(resolveFrontendPath()).toBe(path.resolve(workingDirectory, '../frontend-worktree'));
    });

    it('merges nothing from .env into the environment', () => {
        writeEnvironmentFile('FRONTEND_PATH=/srv/lanes/from-file\nPAIRED_PATH_PROBE=leaked\n');

        resolveFrontendPath();

        expect(process.env.PAIRED_PATH_PROBE).toBeUndefined();
        expect(process.env.FRONTEND_PATH).toBeUndefined();
    });
});
