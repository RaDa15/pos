import type { RequestHandler } from 'express';
import multer from 'multer';
import sharp, { type Metadata } from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { env } from '../config/env.js';

// Multer memory storage with 2MB limit (AC requirement: max 2 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (_req, file, cb) => {
    // Strictly reject SVG
    if (file.mimetype === 'image/svg+xml' || file.originalname.toLowerCase().endsWith('.svg')) {
      return cb(AppError.unsupportedFile('SVG files are not supported. Upload JPEG, PNG or WebP.'));
    }
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(AppError.unsupportedFile('Only JPEG, PNG and WebP images are supported.'));
    }
    cb(null, true);
  },
});

export const imageUploadMiddleware: RequestHandler = upload.single('file');

/**
 * Validates, re-encodes with sharp to WebP (stripping metadata),
 * and saves to disk under env.UPLOAD_DIR/<subfolder>.
 */
export async function processAndSaveImage(
  buffer: Buffer,
  subfolder: 'products' | 'logos'
): Promise<string> {
  let metadata: Metadata;
  try {
    const image = sharp(buffer);
    metadata = await image.metadata();
  } catch {
    throw AppError.unsupportedFile('Invalid or corrupted image file.');
  }

  // Reject SVG or non-supported formats that might have bypassed mimetype check
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw AppError.unsupportedFile('Only JPEG, PNG and WebP images are supported. SVG is not allowed.');
  }

  const filename = `${randomUUID()}.webp`;
  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR, subfolder);

  await fs.mkdir(uploadDir, { recursive: true });

  const targetPath = path.join(uploadDir, filename);

  // Strip metadata and convert to WebP (quality 80)
  await sharp(buffer)
    .rotate() // auto-orient based on EXIF before stripping
    .webp({ quality: 80 })
    .toFile(targetPath);

  // Return public relative path
  return `/${subfolder}/${filename}`;
}

/**
 * Safely deletes a previously uploaded file from disk.
 */
export async function deleteUploadedFile(relativePath?: string | null): Promise<void> {
  if (!relativePath) return;

  try {
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    const fullPath = path.resolve(process.cwd(), env.UPLOAD_DIR, cleanPath);
    await fs.unlink(fullPath);
  } catch {
    // Ignore if file doesn't exist
  }
}
