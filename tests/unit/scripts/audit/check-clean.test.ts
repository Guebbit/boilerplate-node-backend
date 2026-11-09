/**
 * `scripts/audit/check-clean.ts` — the tripwire that tells an audit run whether it wrote outside
 * its report folder. Each case builds a real temp git repo, so the git views are the real ones.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { diffSnapshots, gitEnvironment, snapshotRepo } from '../../../../scripts/audit/check-clean';

/** The run folder, relative to the repo root. */
const RUN = 'tmp/reports/audit-2026-01-01-0000/spec-drift';

/** A fresh repo with one commit, and the folder `tmp/` ignored like the real one. */
let repo = '';

/**
 * Runs git in the temp repo.
 *
 * @param args - the `git` arguments
 */
const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
        cwd: repo,
        env: gitEnvironment(),
        stdio: 'ignore'
    });
};

/**
 * Writes a file in the temp repo, creating its folder.
 *
 * @param file - repo-relative path
 * @param text - the content
 */
const write = (file: string, text = 'x'): void => {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), text);
};

/**
 * What the tripwire would report if `change` ran between the two snapshots.
 *
 * @param change - the write under test
 * @returns the reported rows
 */
const reportAfter = (change: () => void): string[] => {
    const before = snapshotRepo(repo);
    change();
    return diffSnapshots(before, snapshotRepo(repo), RUN);
};

beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'tripwire-'));
    git('init', '-q', '-b', 'main');
    write('.gitignore', 'tmp/\n');
    write('a.txt');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
});

afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('check-clean', () => {
    it('reports nothing when nothing changed', () => {
        expect(reportAfter(() => undefined)).toEqual([]);
    });

    it('does not flag a file written inside the run folder', () => {
        expect(reportAfter(() => write(`${RUN}/orders.findings.md`))).toEqual([]);
    });

    it('flags a file touched outside the run folder', () => {
        const rows = reportAfter(() => write('a.txt', 'changed'));
        expect(rows.join('\n')).toContain('a.txt');
    });

    it('flags a new untracked file', () => {
        expect(reportAfter(() => write('new.txt')).join('\n')).toContain('new.txt');
    });

    it('flags a new branch', () => {
        expect(reportAfter(() => git('branch', 'sneaky')).join('\n')).toContain(
            'refs/heads/sneaky'
        );
    });

    it('flags a new commit', () => {
        const rows = reportAfter(() => {
            write('b.txt');
            git('add', 'b.txt');
            git('commit', '-q', '-m', 'second');
        });
        expect(rows.some((row) => row.startsWith('+ head:'))).toBe(true);
    });

    it('flags a stash', () => {
        const rows = reportAfter(() => {
            write('a.txt', 'dirty');
            git('stash');
        });
        expect(rows.some((row) => row.startsWith('+ stash:'))).toBe(true);
    });
});
