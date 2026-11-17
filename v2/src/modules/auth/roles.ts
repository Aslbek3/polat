// Rollarning YAGONA ro'yxati (server tomoni). Bazadagi CHECK ham shu bilan
// mos (0001_init.sql). Frontend (public/admin/waiters.js, public/login.js)
// alohida, qo'lda mos saqlanadi.
export const ROLES = {
  admin: { home: '/admin/index.html' },
  waiter: { home: '/waiter/tables.html' },
  chef: { home: '/chef/kitchen.html' },
  courier: { home: '/courier/orders.html' },
  kassir: { home: '/kassir/tables.html' },
} as const;

export type Role = keyof typeof ROLES;
export const ROLE_NAMES = Object.keys(ROLES) as Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && value in ROLES;
}

export function homeForRole(role: string): string {
  return isRole(role) ? ROLES[role].home : ROLES.waiter.home;
}
