import { Injectable } from '@nestjs/common';
import { throwAppError } from '../common/errors/error-catalog';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { paginate } from '../common/helpers/paginate.helper';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ── Register ──────────────────────────────────────────────────
  async register(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (existing) throwAppError('CONFLICT', 'Username already taken');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || '',
        username: dto.username.toLowerCase().trim(),
        password: hashed,
        role: Role.USER,
      },
    });

    return this.sanitizeUser(user);
  }

  // ── Admin: create user with explicit role ─────────────────────
  async createUserAsAdmin(dto: { name: string; phone?: string; username: string; password: string; role: Role }) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (existing) throwAppError('CONFLICT', 'Username already taken');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || '',
        username: dto.username.toLowerCase().trim(),
        password: hashed,
        role: dto.role || Role.USER,
      },
    });

    return this.sanitizeUser(user);
  }

  // ── Validate user credentials ─────────────────────────────────
  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return null;
    return this.sanitizeUser(user);
  }

  // ── Find by ID ────────────────────────────────────────────────
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(id, 10) },
    });
    if (!user) return null;
    return this.sanitizeUser(user);
  }

  // ── Token hashing ─────────────────────────────────────────────
  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ── Refresh token management ──────────────────────────────────
  async saveRefreshToken(userId: string, token: string) {
    const hash = this.hashToken(token);
    await this.prisma.refreshToken.create({
      data: { tokenHash: hash, userId: parseInt(userId, 10) },
    });
  }

  async removeRefreshToken(userId: string, token: string) {
    const hash = this.hashToken(token);
    await this.prisma.refreshToken.deleteMany({
      where: { userId: parseInt(userId, 10), tokenHash: hash },
    });
  }

  async findByRefreshToken(token: string) {
    const hash = this.hashToken(token);
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (!row) return null;
    return { userObj: this.sanitizeUser(row.user), userDoc: row.user };
  }

  // ── Login ─────────────────────────────────────────────────────
  async login(dto: { username: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (!user) throwAppError('INVALID_CREDENTIALS');
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throwAppError('INVALID_CREDENTIALS');

    const userObj = this.sanitizeUser(user);
    const payload = { sub: user.id.toString(), username: user.username, role: user.role };
    const access_token = this.jwtService.sign(payload);

    const refresh_token = crypto.randomBytes(64).toString('hex');
    await this.saveRefreshToken(user.id.toString(), refresh_token);

    return { access_token, refresh_token, user: userObj };
  }

  // ── Generate access token ─────────────────────────────────────
  generateAccessToken(payload: { sub: string; username: string; role: string }) {
    return this.jwtService.sign(payload);
  }

  // ── Admin: change user role ───────────────────────────────────
  async changeUserRole(targetUserId: string, newRole: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(targetUserId, 10) },
    });
    if (!user) throwAppError('USER_NOT_FOUND');

    const updated = await this.prisma.user.update({
      where: { id: parseInt(targetUserId, 10) },
      data: { role: newRole },
    });
    return this.sanitizeUser(updated);
  }

  // ── Admin: list all users ─────────────────────────────────────
  async findAllUsers(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        omit: { password: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    const data = users.map((u) => ({
      ...u,
      role: typeof u.role === 'string' ? u.role.toLowerCase() : u.role,
    }));

    return paginate(data, total, page, limit);
  }

  // ── Helper: remove senha do objeto retornado ──────────────────
  private sanitizeUser(user: any) {
    const { password, ...safe } = user;
    // Normaliza role para lowercase (Prisma retorna UPPERCASE — USER, ADMIN, etc.)
    if (safe.role && typeof safe.role === 'string') {
      safe.role = safe.role.toLowerCase();
    }
    return safe;
  }
}
