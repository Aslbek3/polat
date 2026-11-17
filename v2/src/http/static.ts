// Frontend (`public/`) statik fayllari — eski serverdagi kesh siyosati bilan bir xil:
//  .html — no-cache; ?v=... bilan .js/.css — 7 kun; /uploads/ — 1 yil immutable;
//  rasm/shrift — 7 kun; qolgani — no-cache.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type RequestHandler } from 'express';

const WEEK = 7 * 24 * 60 * 60;
const STATIC_ASSET_RE = /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf)$/i;

export const DEFAULT_PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public');

export function staticFiles(dir: string): RequestHandler {
  return express.static(dir, {
    setHeaders(res, filePath) {
      const req = (res as unknown as { req?: express.Request }).req;
      const urlPath = req?.path ?? '';
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (urlPath.startsWith('/uploads/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (/\.(?:js|css)$/i.test(filePath)) {
        const v = req?.query?.v;
        res.setHeader('Cache-Control', typeof v === 'string' && v !== '' ? `public, max-age=${WEEK}` : 'no-cache');
      } else if (STATIC_ASSET_RE.test(filePath)) {
        res.setHeader('Cache-Control', `public, max-age=${WEEK}`);
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  });
}
