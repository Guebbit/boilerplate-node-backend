/*
 * The write-or-verify tail every contract generator ends with, in one place.
 *
 * SHARED SCRIPT — byte-identical in both repos of the pair.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Write a generated file, or under `--check` compare it with what is on disk and exit 1 on a
 * mismatch (via `process.exitCode`, so the message flushes). `--check` writes nothing.
 *
 * @param output - absolute path of the generated file
 * @param text - the file's full expected text
 * @param label - what the file is generated from, for the messages (`openapi.yaml`)
 */
export const writeOrCheck = (output: string, text: string, label: string): void => {
    if (!process.argv.includes('--check')) {
        // The folder may not exist yet: `regenerate` writes some of these BEFORE orval creates `api/`.
        mkdirSync(path.dirname(output), { recursive: true });
        writeFileSync(output, text, 'utf8');
        console.log(`✓ Generated ${output}`);
        return;
    }
    if (existsSync(output) && readFileSync(output, 'utf8') === text) {
        console.log(`✓ ${output} is current with ${label}`);
        return;
    }
    console.error(
        `${output} is not what ${label} generates.\n` +
            `  Run: npm run gen:api\n` +
            `  Then commit the result.`
    );
    process.exitCode = 1;
};
