import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { throwAppError } from '../common/errors/error-catalog';
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
    sameSite: 'lax',       // Safe default — works because frontend proxies requests (same-origin)
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
  });
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refresh', token, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',       // Safe default — works because frontend proxies requests (same-origin)
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
    // Store refresh token in HttpOnly cookie; do NOT expose it in the JSON body
    if (result?.refresh_token) {
      setRefreshCookie(res, result.refresh_token);
    }

    return {
      access_token: result.access_token,
      user: result.user,
    };
  }

  // ── Logout ────────────────────────────────────────────────────
  @Post('logout')
  async logout(
    @Body('refresh_token') refreshToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Prefer refresh token from cookie (HttpOnly). Fallback to body.
    let token = refreshToken;
    try {
      const signed = (req as any).signedCookies || {};
      if (!token && signed.refresh) token = signed.refresh as string;
    } catch {}

    if (token) {
      const found = await this.authService.findByRefreshToken(token);
      if (found?.userObj) {
        await this.authService.removeRefreshToken(found.userObj._id, token);
      }
    }

    res.clearCookie('auth');
    res.clearCookie('refresh');
    return { ok: true };
  }

  // ── Refresh ───────────────────────────────────────────────────
  @Post('refresh')
  async refresh(
    @Body('refresh_token') refreshToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Accept refresh token from cookie (HttpOnly) or request body
    let token = refreshToken;
    try {
      const signed = (req as any).signedCookies || {};
      if (!token && signed.refresh) token = signed.refresh as string;
    } catch {}

    if (!token) throwAppError('UNAUTHORIZED');
    const found = await this.authService.findByRefreshToken(token);
    if (!found) throwAppError('UNAUTHORIZED');

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
    await this.authService.removeRefreshToken(userDoc._id.toString(), token as string);
    await this.authService.saveRefreshToken(userDoc._id.toString(), newRefresh);

    // set cookies: access token (auth) and refresh token (refresh)
    setAuthCookie(res, access_token);
    setRefreshCookie(res, newRefresh);

    return { access_token, user: userObj };
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

  // ── Promote user to ADMIN (convenience route for admins) ──────
  @Post('admin/users/:id/make-admin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async makeAdmin(@Param('id') userId: string) {
    return this.authService.changeUserRole(userId, Role.ADMIN);
  }
}
