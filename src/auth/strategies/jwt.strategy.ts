import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => {
          if (!req) return null;
          // Prioridade: signed cookie > unsigned cookie > Bearer header
          if (req.signedCookies?.auth) return req.signedCookies.auth;
          if (req.cookies?.auth) return req.cookies.auth;
          return null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secretKey',
    });
  }

  /**
   * Payload do JWT inclui: sub, username, role.
   * Retorna o user completo do banco (sem password/refreshTokens).
   */
  async validate(payload: { sub: string; username: string; role: string }) {
    const user = await this.authService.findById(payload.sub);
    if (!user) return null;
    return user; // { _id, name, username, phone, role, createdAt, updatedAt }
  }
}
