import { ApplicationException } from '../exceptions/application.exception';

export const ErrorCatalog = {
  USER_NOT_FOUND: { status: 404, code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' },
  INVALID_CREDENTIALS: { status: 401, code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' },
  UNAUTHORIZED: { status: 401, code: 'UNAUTHORIZED', message: 'Não autorizado' },
  FORBIDDEN: { status: 403, code: 'FORBIDDEN', message: 'Acesso negado' },
  VALIDATION_ERROR: { status: 400, code: 'VALIDATION_ERROR', message: 'Dados inválidos' },
  CONFLICT: { status: 409, code: 'CONFLICT', message: 'Conflito' },
  INTERNAL_ERROR: { status: 500, code: 'INTERNAL_ERROR', message: 'Erro interno' },
} as const;

export type ErrorKey = keyof typeof ErrorCatalog;

export function buildAppException(key: ErrorKey, overrideMessage?: string | string[], details?: any) {
  const entry = ErrorCatalog[key];
  return new ApplicationException(overrideMessage ?? entry.message, entry.status, entry.code, details);
}

export function throwAppError(key: ErrorKey, overrideMessage?: string | string[], details?: any): never {
  throw buildAppException(key, overrideMessage, details);
}
