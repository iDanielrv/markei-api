import { Injectable, ConflictException, NotFoundException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, Role } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  // ── Register ──────────────────────────────────────────────────
  async register(dto: CreateUserDto) {
    const existing = await this.userModel.findOne({ username: dto.username.toLowerCase() }).exec();
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const hashed = await bcrypt.hash(dto.password, 12); // 12 rounds (mais seguro que 10)
    const created = new this.userModel({
      name: dto.name.trim(),
      phone: dto.phone?.trim() || '',
      username: dto.username.toLowerCase().trim(),
      password: hashed,
      role: Role.USER, // todo novo usuário começa como user
    });

    const saved = await created.save();
    return this.sanitizeUser(saved);
  }

  // ── Validate user credentials ─────────────────────────────────
  async validateUser(username: string, password: string) {
    const user = await this.userModel.findOne({ username: username.toLowerCase() }).exec();
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return null;
    return this.sanitizeUser(user);
  }

  // ── Find by ID ────────────────────────────────────────────────
  async findById(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) return null;
    return this.sanitizeUser(user);
  }

  // ── Token hashing ────────────────────────────────────────────
  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ── Refresh token management ──────────────────────────────────
  async saveRefreshToken(userId: string, token: string) {
    const hash = this.hashToken(token);
    await this.userModel.updateOne({ _id: userId }, { $push: { refreshTokens: hash } }).exec();
  }

  async removeRefreshToken(userId: string, token: string) {
    const hash = this.hashToken(token);
    await this.userModel.updateOne({ _id: userId }, { $pull: { refreshTokens: hash } }).exec();
  }

  async findByRefreshToken(token: string) {
    const hash = this.hashToken(token);
    const user = await this.userModel.findOne({ refreshTokens: hash }).exec();
    if (!user) return null;
    return { userObj: this.sanitizeUser(user), userDoc: user } as any;
  }

  // ── Login ─────────────────────────────────────────────────────
  async login(dto: { username: string; password: string }) {
    const user = await this.userModel.findOne({ username: dto.username.toLowerCase() }).exec();
    if (!user) throw new UnauthorizedException('Credenciais inválidas');
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    const userObj = this.sanitizeUser(user);
    const payload = { sub: user._id.toString(), username: user.username, role: user.role };
    const access_token = this.jwtService.sign(payload);

    // Generate refresh token
    const refresh_token = crypto.randomBytes(64).toString('hex');
    await this.saveRefreshToken(user._id.toString(), refresh_token);

    return { access_token, refresh_token, user: userObj };
  }

  // ── Generate access token ─────────────────────────────────────
  generateAccessToken(payload: { sub: string; username: string; role: string }) {
    return this.jwtService.sign(payload);
  }

  // ── Admin: change user role ───────────────────────────────────
  async changeUserRole(targetUserId: string, newRole: Role) {
    const user = await this.userModel.findById(targetUserId).exec();
    if (!user) throw new NotFoundException('Usuário não encontrado');

    user.role = newRole;
    await user.save();
    return this.sanitizeUser(user);
  }

  // ── Admin: list all users ─────────────────────────────────────
  async findAllUsers() {
    const users = await this.userModel.find().select('-password -refreshTokens').exec();
    return users;
  }

  // ── Helper: remove senha e tokens do objeto retornado ─────────
  private sanitizeUser(user: UserDocument) {
    const obj = user.toObject();
    const { password, refreshTokens, ...safe } = obj;
    return safe;
  }
}
