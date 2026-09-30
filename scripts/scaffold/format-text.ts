/**
 * @module
 * Formatting for scaffolded text, behind a seam: the real Prettier lives here, and a unit test
 * (where Prettier cannot load, its dynamic imports need a Node flag Jest does not set) passes an
 * identity formatter instead.
 */

import path from 'node:path';
import { format, getFileInfo, resolveConfig } from 'prettier';

/** Turns raw text into what `prettier:check` accepts for `file`. */
export type FormatText = (root: string, file: string, content: string) => Promise<string>;

/**
 * Format the way the Prettier CLI would, so the output passes `prettier:check` untouched. Two
 * details the API does not do by itself: `editorconfig: true` (the CLI reads `.editorconfig`, the
 * API does not), and `.prettierignore` (a hand-formatted shared file the repo excludes must not be
 * reflowed wholesale around a one-line edit).
 * @param root - the repo root, where `.prettierignore` sits
 * @param file - absolute path, which selects both the parser and the config
 * @param content - the unformatted text
 * @returns the formatted text
 */
export const formatWithRepoConfig: FormatText = async (root, file, content) => {
    // Prettier: is this file excluded by the given ignore file? https://prettier.io/docs/api#prettiergetfileinfofilepath--options
    const { ignored } = await getFileInfo(file, {
        ignorePath: path.join(root, '.prettierignore')
    });
    if (ignored) return content;

    // Prettier: `format` takes the text plus options; `filepath` picks the parser (ts, yaml, md).
    // https://prettier.io/docs/api#prettierformatsource-options
    return format(content, {
        // `resolveConfig` reads .prettierrc / .editorconfig for that file.
        ...(await resolveConfig(file, { editorconfig: true })),
        filepath: file
    });
};
