#!/usr/bin/env tsx
/**
 * Validates AsyncAPI documents against the parser's default ruleset — the replacement for
 * `asyncapi validate` now that `@asyncapi/cli` is gone. Same parser, same default ruleset
 * (`spectral:asyncapi`/`recommended`), so the diagnostics are unchanged; only the CLI's ~446 MB
 * and its telemetry are. Takes one or more file paths:
 *
 *   npm run lint:asyncapi
 *
 * https://github.com/asyncapi/parser-js#readme
 */

import { readFileSync } from 'node:fs';
import { Parser, DiagnosticSeverity, type Diagnostic } from '@asyncapi/parser';
import { stylish } from '@stoplight/spectral-formatters';

const files = process.argv.slice(2);

if (files.length === 0) {
    console.error('Usage: validate-asyncapi.ts <file...>');
    process.exit(1);
}

const parser = new Parser();

/*
 * Two nominally distinct but structurally identical DiagnosticSeverity enums:
 * @stoplight/spectral-core nests its own copy of @stoplight/types, separate from the hoisted one
 * this file imports through @asyncapi/parser.
 */
/** True when any diagnostic is error-severity — the parser's own definition of invalid. */
const isInvalid = (diagnostics: readonly Diagnostic[]): boolean =>
    diagnostics.some(
        (diagnostic) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- see block comment above
            diagnostic.severity === DiagnosticSeverity.Error
    );

/*
 * Validates every file in parallel, printing each one's diagnostics as it resolves, then exits
 * non-zero if any file failed — the same contract `asyncapi validate` had.
 */
Promise.all(
    files.map((file) =>
        parser.parse(readFileSync(file, 'utf8'), { source: file }).then(({ diagnostics }) => {
            const invalid = isInvalid(diagnostics);
            console.log(
                `\n${file} ${invalid ? 'has governance issues and is INVALID' : 'is valid'}.`
            );
            if (diagnostics.length > 0) {
                console.log(stylish(diagnostics, { failSeverity: DiagnosticSeverity.Error }));
            }
            return invalid;
        })
    )
)
    .then((results) => {
        if (results.some(Boolean)) {
            process.exit(1);
        }
    })
    .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
