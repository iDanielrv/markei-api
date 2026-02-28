import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { throwAppError } from '../../common/errors/error-catalog';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard que verifica se o usuário autenticado possui uma das roles
 * necessárias definidas pelo decorator @Roles().
 *
 * Deve ser usado DEPOIS do AuthGuard('jwt'), pois depende de req.user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Se nenhum @Roles() definido, libera acesso
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throwAppError('FORBIDDEN', 'Acesso negado: usuário sem role definida');
    }

    if (!requiredRoles.includes(user.role as Role)) {
      throwAppError('FORBIDDEN', 'Acesso negado: permissão insuficiente');
    }

    return true;
  }
}
