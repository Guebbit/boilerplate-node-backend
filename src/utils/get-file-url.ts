import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 *
 * @param metaUrl
 */
export function getFileUrl(metaUrl: string) {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const __filename = fileURLToPath(metaUrl);
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const __dirname = path.dirname(__filename);
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return { __filename, __dirname };
}

/**
 *
 * @param metaUrl
 */
export function getFilename(metaUrl: string) {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { __filename } = getFileUrl(metaUrl);
    return __filename;
}
/**
 *
 * @param metaUrl
 */
export function getDirname(metaUrl: string) {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { __dirname } = getFileUrl(metaUrl);
    return __dirname;
}