// /api/customer/auth/session|logout (ochiq) va /api/customer/* (requireCustomer).
// Telegram/SMS orqali kirish (start, verify, link-status) — 5-bosqichda.
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../../http/app.js';
import { parse } from '../../http/validate.js';
import { UnauthorizedError } from '../../http/errors.js';
import type { CustomerSessions } from './customerSession.js';
import {
  addAddress, deleteAddress, listAddresses, publicCustomer, revokeCustomerSessions, updateAddress, updateName,
  type AddressInput,
} from './customers.service.js';

const Id = z.coerce.number().int().positive();

const NameBody = z.object({
  full_name: z
    .string({ error: 'Ismingizni to‘liq kiriting (2–60 belgi)' })
    .transform((s) => s.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'Ismingizni to‘liq kiriting (2–60 belgi)').max(60, 'Ismingizni to‘liq kiriting (2–60 belgi)')),
});

const AddressBody = z
  .object({
    label: z.string().optional().nullable(),
    address: z.string({ error: "Manzilni to'liq kiriting (5–200 belgi)" }),
    location_lat: z.unknown().optional(),
    location_lng: z.unknown().optional(),
    is_default: z.unknown().optional(),
  })
  .transform((b, ctx): AddressInput => {
    const address = b.address.trim();
    if (address.length < 5 || address.length > 200) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: "Manzilni to'liq kiriting (5–200 belgi)" });
      return z.NEVER;
    }
    const lat = Number(b.location_lat);
    const lng = Number(b.location_lng);
    const hasLoc = b.location_lat != null && b.location_lng != null &&
      Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return {
      label: (b.label ?? '').trim().slice(0, 30) || null,
      address,
      lat: hasLoc ? lat : null,
      lng: hasLoc ? lng : null,
      isDefault: Boolean(b.is_default),
    };
  });

export function customerAuthRoutes({ db }: AppDeps, sessions: CustomerSessions): Router {
  const r = Router();
  // Login qilmagan bo'lsa ham 200 (brauzer konsolida 401 chiqmasin).
  r.get('/session', async (req, res) => {
    const customer = await sessions.current(req);
    if (!customer) return void res.json({ customer: null });
    res.json({ customer: publicCustomer(customer), addresses: await listAddresses(db, customer.id) });
  });
  r.post('/logout', (req, res) => {
    sessions.logout(req, res);
    res.json({ ok: true });
  });
  return r;
}

export function requireCustomer(sessions: CustomerSessions): RequestHandler {
  return async (req, _res, next) => {
    const customer = await sessions.current(req);
    if (!customer) throw new UnauthorizedError('Hisobingizga kiring');
    req.customer = customer;
    next();
  };
}

export function customerAccountRoutes({ db }: AppDeps, sessions: CustomerSessions): Router {
  const r = Router();

  r.get('/me', async (req, res) => {
    res.json({ customer: publicCustomer(req.customer!), addresses: await listAddresses(db, req.customer!.id) });
  });

  r.put('/me', async (req, res) => {
    const { full_name } = parse(NameBody, req.body ?? {});
    const updated = await updateName(db, req.customer!.id, full_name);
    res.json({ ok: true, customer: publicCustomer(updated) });
  });

  r.post('/logout-all', async (req, res) => {
    await revokeCustomerSessions(db, req.customer!.id);
    sessions.logout(req, res);
    res.json({ ok: true });
  });

  r.get('/addresses', async (req, res) => {
    res.json({ addresses: await listAddresses(db, req.customer!.id) });
  });

  r.post('/addresses', async (req, res) => {
    const a = parse(AddressBody, req.body ?? {});
    const result = await addAddress(db, req.customer!.id, a);
    res.json({ ok: true, id: result.id, ...(result.duplicate ? { duplicate: true } : {}), addresses: await listAddresses(db, req.customer!.id) });
  });

  r.put('/addresses/:id', async (req, res) => {
    const a = parse(AddressBody, req.body ?? {});
    await updateAddress(db, req.customer!.id, parse(Id, req.params.id), a);
    res.json({ ok: true, addresses: await listAddresses(db, req.customer!.id) });
  });

  r.delete('/addresses/:id', async (req, res) => {
    await deleteAddress(db, req.customer!.id, parse(Id, req.params.id));
    res.json({ ok: true, addresses: await listAddresses(db, req.customer!.id) });
  });

  return r;
}
