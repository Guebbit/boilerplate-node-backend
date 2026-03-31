import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { randomBytes } from 'node:crypto';

/**
 * Get extension of filename
 *
 * @param filename
 */
export function getExtension(filename: string) {
    return filename.slice(filename.lastIndexOf('.') + 1);
}

/**
 * Manage file storage
 */
export const fileStorage = multer.diskStorage({
    /**
     * Write file into destination
     * WARNING: Do not upload all files in a single directory. Create subdirectories with a maximum number of files?
     *
     * @param request
     * @param file
     * @param callback
     */
    destination: (
        request: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, destination: string) => void
    ) => {
        if (file.fieldname === 'imageUpload')
            // eslint-disable-next-line unicorn/no-null
            callback(null, (process.env.NODE_PUBLIC_PATH ?? 'public') + '/images/');
        // if (file.fieldname === "pdfUpload")
        //     callback(null, 'src/uploads/');
        else callback(new Error(`Unsupported upload field: ${file.fieldname}`), '');
    },

    /**
     * Change file name
     *
     * @param request
     * @param file
     * @param callback
     */
    filename: (
        request: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, filename: string) => void
    ) => {
        // randomize name for security reason
        // eslint-disable-next-line unicorn/no-null
        callback(null, randomBytes(16).toString('hex') + '.' + getExtension(file.originalname));
    }
});

/**
 * Whitelist for file type
 *
 * @param request
 * @param file
 * @param callback
 */
export const fileFilter = (
    request: Request,
    file: Express.Multer.File,
    callback: FileFilterCallback
): void =>
    file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg'
        ? // eslint-disable-next-line unicorn/no-null
          callback(null, true)
        : // eslint-disable-next-line unicorn/no-null
          callback(null, false);

/**
 * Multer middleware
 */
export default multer({
    storage: fileStorage,
    fileFilter
});
