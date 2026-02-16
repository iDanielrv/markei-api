import { SetMetadata } from '@nestjs/common';
import { Role } from '../schemas/user.schema';

export const ROLES_KEY = 'roles';

/**
 * Decorator para definir quais roles podem acessar um endpoint.
 * Uso: @Roles(Role.ADMIN) ou @Roles(Role.ADMIN, Role.MODERATOR)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
