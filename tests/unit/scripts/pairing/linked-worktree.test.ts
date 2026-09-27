/**
 * `isLinkedWorktree`, and the `sync:frontend` refusal built on it.
 *
 * Everything runs against real throwaway git repositories: which checkout is a worktree is git's
 * answer, and a stubbed git would only test the stub.
 *
 * The refusal's logic is the exported decision. The CLI is run twice, to prove the wiring:
 *
 * Refused:  linked worktree → frontend main exits at the guard, before anything else runs.
 * `--dry`:  gets past the guard, to the staleness gate. That gate fails in a throwaway directory
 *           with no contract to check — the expected, different refusal that proves it got there.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    isLinkedWorktree,
    writesIntoMainFromWorktree
} from '../../../../scripts/pairing/linked-worktree';

/** The repo's own `tsx`, by absolute path: the CLI runs from a directory with no node_modules. */
const TSX = path.resolve(__dirname, '../../../../node_modules/.bin/tsx');

/** The CLI under test, by absolute path for the same reason. */
const SYNC = path.resolve(__dirname, '../../../../scripts/pairing/sync-to-frontend.ts');

/** The guard's own message, and nothing past it. */
const REFUSAL = 'Refusing to write into';

/** The staleness gate's message — the next refusal after the guard. */
const GATE_REFUSAL = 'Refusing to copy';

/** Root of this case's throwaway repositories. */
let sandbox: string;

/**
 * Runs git in a directory, with an identity so a commit works on a bare CI runner.
 *
 * @param directory - where git runs
 * @param argv - the git arguments
 */
const git = (directory: string, ...argv: string[]): void => {
    /*
     * Runs git as a child process; it throws on a non-zero exit, which fails the case.
     * `-c` sets a one-off config value for this command only.
     * https://git-scm.com/docs/git#Documentation/git.txt--cltnamegtltvaluegt
     */
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...argv], {
        cwd: directory,
        stdio: 'ignore'
    });
};

/**
 * Creates a repository with one commit and a linked worktree beside it.
 *
 * @param name - a directory name inside the sandbox, so two pairs never collide
 * @returns the main working tree and the linked worktree
 */
const makeRepository = (name: string): { main: string; linked: string } => {
    const main = path.join(sandbox, name);
    const linked = path.join(sandbox, `${name}-worktree`);
    mkdirSync(main);
    git(main, 'init', '--quiet');
    git(main, 'commit', '--quiet', '--allow-empty', '--message', 'init');
    git(main, 'worktree', 'add', '--quiet', '-b', 'lane', linked);
    return { main, linked };
};

/**
 * Runs `sync:frontend` the way `npm run` would, from `cwd`, aimed at `frontend`.
 *
 * @param cwd - the backend checkout it runs from
 * @param frontend - the value handed over as `FRONTEND_PATH`
 * @param flags - extra CLI flags
 * @returns its exit code and stderr
 */
const runSync = (
    cwd: string,
    frontend: string,
    ...flags: string[]
): { status: number | null; stderr: string } => {
    /*
     * Runs the CLI to completion and captures its output instead of throwing on failure.
     * https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options
     *
     * `npm_config_yes=false` + `npm_config_offline`: the staleness gate calls `npx tsx`, and from a
     * directory with no node_modules npx would otherwise download tsx rather than fail.
     * https://docs.npmjs.com/cli/commands/npm-exec#yes
     */
    const result = spawnSync(TSX, [SYNC, ...flags], {
        cwd,
        encoding: 'utf8',
        env: {
            ...process.env,
            FRONTEND_PATH: frontend,
            npm_config_yes: 'false',
            npm_config_offline: 'true'
        }
    });
    return { status: result.status, stderr: result.stderr };
};

beforeEach(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'linked-worktree-'));
});

afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
});

describe('isLinkedWorktree', () => {
    it("answers false for a repository's main working tree", () => {
        const { main } = makeRepository('repo');

        expect(isLinkedWorktree(main)).toBe(false);
    });

    it('answers true for a linked worktree', () => {
        const { linked } = makeRepository('repo');

        expect(isLinkedWorktree(linked)).toBe(true);
    });

    it('answers for the checkout, from any directory inside it', () => {
        const { main } = makeRepository('repo');
        const nested = path.join(main, 'scripts', 'pairing');
        mkdirSync(nested, { recursive: true });

        expect(isLinkedWorktree(nested)).toBe(false);
    });

    it('answers undefined outside any git checkout', () => {
        expect(isLinkedWorktree(sandbox)).toBeUndefined();
    });
});

describe('writesIntoMainFromWorktree', () => {
    it("is true for a linked worktree writing into the frontend's main checkout", () => {
        const backend = makeRepository('backend');
        const frontend = makeRepository('frontend');

        expect(writesIntoMainFromWorktree(backend.linked, frontend.main)).toBe(true);
    });

    it('is false for a lane writing into its own paired frontend worktree', () => {
        const backend = makeRepository('backend');
        const frontend = makeRepository('frontend');

        expect(writesIntoMainFromWorktree(backend.linked, frontend.linked)).toBe(false);
    });

    it('is false for backend main writing into frontend main', () => {
        const backend = makeRepository('backend');
        const frontend = makeRepository('frontend');

        expect(writesIntoMainFromWorktree(backend.main, frontend.main)).toBe(false);
    });

    it('is false when the frontend is not a git checkout — no main to protect', () => {
        const backend = makeRepository('backend');
        const plainCopy = path.join(sandbox, 'plain-copy');
        mkdirSync(plainCopy);

        expect(writesIntoMainFromWorktree(backend.linked, plainCopy)).toBe(false);
    });
});

describe('sync:frontend from a linked worktree', () => {
    // Each case spawns tsx; the default five seconds is too tight on a loaded machine.
    jest.setTimeout(60_000);

    it("refuses to write into the frontend's main checkout, before anything else runs", () => {
        const backend = makeRepository('backend');
        const frontend = makeRepository('frontend');

        const { status, stderr } = runSync(backend.linked, frontend.main);

        expect(status).toBe(1);
        expect(stderr).toContain(REFUSAL);
        expect(stderr).not.toContain(GATE_REFUSAL);
    });

    it('lets --dry past the guard, since it writes nothing', () => {
        const backend = makeRepository('backend');
        const frontend = makeRepository('frontend');

        const { stderr } = runSync(backend.linked, frontend.main, '--dry');

        expect(stderr).not.toContain(REFUSAL);
        expect(stderr).toContain(GATE_REFUSAL);
    });
});
