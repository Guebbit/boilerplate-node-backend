/**
 * @module
 * Image fixtures for the suites that upload through the real pipeline.
 */

import path from 'node:path';
import sharp from 'sharp';
import { currentEnvironment } from '@infrastructure/config/store';

/**
 * A genuinely decodable PNG. With no broker an upload is digested inline, so sharp has to decode
 * it: a stub of random bytes would be refused. A 4x4 encode costs nothing, so a suite calls this
 * in `beforeAll` rather than caching it.
 */
export const decodablePng = (): Promise<Buffer> =>
    sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
        .png()
        .toBuffer();

/**
 * The directory the app serves files from. `tests/support/setup-file-sandbox.ts` assigns it before
 * any test file's own top-level code runs, so it is never actually unset: the `!` narrows what the
 * compiler cannot see.
 */
export const publicDirectory = (): string => path.resolve(currentEnvironment().NODE_PUBLIC_PATH!);
