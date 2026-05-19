import { ApplicationException } from '../exceptions/application.exception';

export const ErrorCatalog = {
  // Auth
  USER_NOT_FOUND: {
    status: 404,
    code: 'USER_NOT_FOUND',
    message: 'Usuário não encontrado',
  },
  INVALID_CREDENTIALS: {
    status: 401,
    code: 'INVALID_CREDENTIALS',
    message: 'Credenciais inválidas',
  },
  UNAUTHORIZED: {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'Não autorizado',
  },
  FORBIDDEN: {
    status: 403,
    code: 'FORBIDDEN',
    message: 'Acesso negado',
  },
  USERNAME_TAKEN: {
    status: 409,
    code: 'USERNAME_TAKEN',
    message: 'Este usuário já está em uso',
  },

  // Company
  COMPANY_NOT_FOUND: {
    status: 404,
    code: 'COMPANY_NOT_FOUND',
    message: 'Empresa não encontrada',
  },
  COMPANY_ALREADY_EXISTS: {
    status: 409,
    code: 'COMPANY_ALREADY_EXISTS',
    message: 'Você já possui uma empresa cadastrada',
  },
  SLUG_TAKEN: {
    status: 409,
    code: 'SLUG_TAKEN',
    message: 'Este slug já está em uso',
  },

  // Service
  SERVICE_NOT_FOUND: {
    status: 404,
    code: 'SERVICE_NOT_FOUND',
    message: 'Serviço não encontrado',
  },

  // Schedule
  SCHEDULE_NOT_FOUND: {
    status: 404,
    code: 'SCHEDULE_NOT_FOUND',
    message: 'Horário não encontrado',
  },
  BLOCKED_DATE_NOT_FOUND: {
    status: 404,
    code: 'BLOCKED_DATE_NOT_FOUND',
    message: 'Data bloqueada não encontrada',
  },
  INVALID_TIME_RANGE: {
    status: 400,
    code: 'INVALID_TIME_RANGE',
    message: 'startTime deve ser anterior a endTime',
  },
  DATE_BLOCKED: {
    status: 409,
    code: 'DATE_BLOCKED',
    message: 'Esta data está bloqueada',
  },

  // Appointment
  APPOINTMENT_NOT_FOUND: {
    status: 404,
    code: 'APPOINTMENT_NOT_FOUND',
    message: 'Agendamento não encontrado',
  },
  APPOINTMENT_SLOT_TAKEN: {
    status: 409,
    code: 'APPOINTMENT_SLOT_TAKEN',
    message: 'Este horário já está ocupado',
  },
  APPOINTMENT_ALREADY_CANCELLED: {
    status: 409,
    code: 'APPOINTMENT_ALREADY_CANCELLED',
    message: 'Agendamento já está cancelado',
  },
  SLOT_OUTSIDE_SCHEDULE: {
    status: 422,
    code: 'SLOT_OUTSIDE_SCHEDULE',
    message: 'Horário fora do expediente da empresa',
  },

  // Generic
  VALIDATION_ERROR: {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Dados inválidos',
  },
  CONFLICT: { status: 409, code: 'CONFLICT', message: 'Conflito' },
  INTERNAL_ERROR: {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Erro interno',
  },
} as const;

export type ErrorKey = keyof typeof ErrorCatalog;

export function buildAppException(
  key: ErrorKey,
  overrideMessage?: string | string[],
  details?: any,
) {
  const entry = ErrorCatalog[key];
  return new ApplicationException(
    overrideMessage ?? entry.message,
    entry.status,
    entry.code,
    details,
  );
}

export function throwAppError(
  key: ErrorKey,
  overrideMessage?: string | string[],
  details?: any,
): never {
  throw buildAppException(key, overrideMessage, details);
}
