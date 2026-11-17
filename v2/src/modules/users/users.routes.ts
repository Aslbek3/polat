import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../../http/app.js';
import { parse } from '../../http/validate.js';
import { MIN_PASSWORD_LENGTH } from '../../lib/passwords.js';
import { ROLE_NAMES } from '../auth/roles.js';
import { createUser, deleteUser, listUsers, resetPassword, updateUser } from './users.service.js';

const Id = z.coerce.number({ error: "ID noto'g'ri" }).int().positive("ID noto'g'ri");
const Password = z
  .string({ error: `Parol kamida ${MIN_PASSWORD_LENGTH} belgi bo'lishi kerak` })
  .min(MIN_PASSWORD_LENGTH, `Parol kamida ${MIN_PASSWORD_LENGTH} belgi bo'lishi kerak`)
  .max(200);
const RoleSchema = z.enum(ROLE_NAMES as [string, ...string[]], { error: "Rol noto'g'ri" });
const FullName = z.string().trim().max(100).transform((s) => s || null).nullable();

const CreateBody = z.object({
  username: z.string({ error: 'Login kiritilishi shart' }).trim().min(1, 'Login kiritilishi shart').max(64),
  password: Password,
  role: RoleSchema,
  full_name: FullName.optional(),
});
const UpdateBody = z.object({
  full_name: FullName.optional(),
  role: RoleSchema.optional(),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(Boolean).optional(),
});

export function usersRoutes({ db }: AppDeps): Router {
  const r = Router();

  r.get('/', async (_req, res) => {
    res.json(await listUsers(db));
  });

  r.post('/', async (req, res) => {
    const body = parse(CreateBody, req.body);
    res.json(await createUser(db, body as Parameters<typeof createUser>[1], req.user!.id));
  });

  r.put('/:id', async (req, res) => {
    const id = parse(Id, req.params.id);
    const body = parse(UpdateBody, req.body ?? {});
    res.json(await updateUser(db, id, body as Parameters<typeof updateUser>[2], req.user!.id));
  });

  r.post('/:id/reset-password', async (req, res) => {
    const id = parse(Id, req.params.id);
    const { password } = parse(z.object({ password: Password }), req.body ?? {});
    await resetPassword(db, id, password, req.user!.id);
    res.json({ ok: true });
  });

  r.delete('/:id', async (req, res) => {
    const id = parse(Id, req.params.id);
    res.json({ ok: true, ...(await deleteUser(db, id, req.user!.id)) });
  });

  return r;
}
