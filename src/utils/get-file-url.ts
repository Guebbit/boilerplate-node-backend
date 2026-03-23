import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 *
 * @param metaUrl
 */
export const getFileUrl = (metaUrl: string)=> {
    const filename = fileURLToPath(metaUrl); // __filename
    const dirname = path.dirname(__filename); // __dirname
    return { filename, dirname };
}

/**
 *
 * @param metaUrl
 */
export const getFilename = (metaUrl: string)=>
    getFileUrl(metaUrl).filename

/**
 *
 * @param metaUrl
 */
export const getDirname = (metaUrl: string)=>
    getFileUrl(metaUrl).dirname