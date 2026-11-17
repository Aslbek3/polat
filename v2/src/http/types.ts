import type { Role } from '../modules/auth/roles.js';

export interface StaffUser {
  id: number;
  username: string;
  role: Role;
  full_name: string | null;
  session_version: number;
}

export interface CustomerUser {
  id: number;
  phone: string;
  full_name: string | null;
  session_version: number;
  created_at: Date;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: StaffUser;
    customer?: CustomerUser;
  }
}
