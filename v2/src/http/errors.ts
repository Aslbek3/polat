// Ilova xatolari. Service qatlami faqat shularni otadi; HTTP qatlami ularni
// to'g'ri status kodiga aylantiradi. `message` — foydalanuvchiga ko'rsatiladi
// (o'zbekcha, xavfsiz). Kutilmagan xatolar (500) tafsiloti faqat logga tushadi.
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'validation_error', details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Tizimga kiring') {
    super(message, 401, 'unauthorized');
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Bu amal uchun ruxsat yo'q") {
    super(message, 403, 'forbidden');
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Topilmadi') {
    super(message, 404, 'not_found');
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, 'conflict', details);
  }
}
export class GoneError extends AppError {
  constructor(message: string) {
    super(message, 410, 'gone');
  }
}
export class TooManyRequestsError extends AppError {
  constructor(message = "Juda ko'p so'rov yuborildi, birozdan so'ng qayta urinib ko'ring") {
    super(message, 429, 'too_many_requests');
  }
}
