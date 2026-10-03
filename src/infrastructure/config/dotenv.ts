/**
 * @module
 * Loads `.env` into `process.env`, and tells the config store it did.
 *
 * Why:   an entry point imports this FIRST, for its side effect alone. The store reads
 *        `process.env` once; a read that happens before `.env` is loaded would otherwise freeze
 *        a snapshot without it.
 * Never: overrides a variable the shell already set (dotenv's own rule).
 *
 * See: docs/tools/configuration.md
 */

// dotenv: loads `.env` from the working directory into `process.env`, skipping keys already set.
// https://github.com/motdotla/dotenv#readme
import 'dotenv/config';
