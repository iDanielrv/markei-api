import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Res,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import type { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from './schemas/user.schema';
import * as crypto from 'crypto';

// ── Cookie helper ───────────────────────────────────────────────
function setAuthCookie(res: Response, token: string) {
  res.cookie('auth', token, {
    httpOnly: true,        // NÃO acessível por JS (proteção XSS)
    signed: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Register ──────────────────────────────────────────────────
  @Post('register')
  register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  // ── Login ─────────────────────────────────────────────────────
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    if (result?.access_token) {
      setAuthCookie(res, result.access_token);
    }
    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      user: result.user,
    };
  }

  // ── Logout ────────────────────────────────────────────────────
  @Post('logout')
  async logout(
    @Body('refresh_token') refreshToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (refreshToken) {
      const found = await this.authService.findByRefreshToken(refreshToken);
      if (found?.userObj) {
        await this.authService.removeRefreshToken(found.userObj._id, refreshToken);
      }
    }
    res.clearCookie('auth');
    return { ok: true };
  }

  // ── Refresh ───────────────────────────────────────────────────
  @Post('refresh')
  async refresh(
    @Body('refresh_token') refreshToken: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!refreshToken) throw new UnauthorizedException();
    const found = await this.authService.findByRefreshToken(refreshToken);
    if (!found) throw new UnauthorizedException();

    const userDoc = found.userDoc as any;
    const userObj = found.userObj;

    const payload = {
      sub: userDoc._id.toString(),
      username: userDoc.username,
      role: userDoc.role,
    };
    const access_token = this.authService.generateAccessToken(payload);

    // Rotate refresh token: remove old, create new
    const newRefresh = crypto.randomBytes(64).toString('hex');
    await this.authService.removeRefreshToken(userDoc._id.toString(), refreshToken);
    await this.authService.saveRefreshToken(userDoc._id.toString(), newRefresh);

    setAuthCookie(res, access_token);
    return { access_token, refresh_token: newRefresh, user: userObj };
  }

  // ── Profile (any authenticated user) ──────────────────────────
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  profile(@Req() req: Request) {
    return (req as any).user;
  }

  // ── Admin: listar todos os usuários ───────────────────────────
  @Get('admin/users')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async listUsers() {
    return this.authService.findAllUsers();
  }

  // ── Admin: alterar role de um usuário ─────────────────────────
  @Post('admin/users/:id/role')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async changeRole(
    @Param('id') userId: string,
    @Body('role') role: Role,
  ) {
    return this.authService.changeUserRole(userId, role);
  }
}
