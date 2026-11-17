// So'rov ma'lumotini zod sxemasi bilan tekshirish. Har bir route kirishini
// shu orqali o'qiydi — qo'lda `Number(req.body.x)` va `typeof` tekshiruvlari
// o'rniga bitta joyda, turi aniq natija.
import type { z } from 'zod';
import { ValidationError } from './errors.js';

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const field = first?.path.join('.') || undefined;
  throw new ValidationError(first?.message ?? "Ma'lumot noto'g'ri", field ? { field } : undefined);
}
