import type { Request, Response } from 'express';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    try {
      out[name] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      /* buzilgan cookie — e'tiborsiz */
    }
  }
  return out;
}

export function readCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

/** HttpOnly, SameSite=Lax, HTTPS'da Secure. maxAgeSeconds=0 — o'chirish. */
export function writeCookie(req: Request, res: Response, name: string, value: string, maxAgeSeconds: number): void {
  const secure = req.secure ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`,
  );
}
