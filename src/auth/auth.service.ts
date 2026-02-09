import { Injectable, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async register(dto: CreateUserDto) {
    const existing = await this.userModel.findOne({ username: dto.username }).exec();
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const created = new this.userModel({
      name: dto.name,
      phone: dto.phone,
      username: dto.username,
      password: hashed,
    });

    const saved = await created.save();
    const { password: _, ...userObj } = saved.toObject();
    return userObj;
  }

  async validateUser(username: string, password: string) {
    const user = await this.userModel.findOne({ username }).exec();
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return null;
    const { password: _, ...userObj } = user.toObject();
    return userObj;
  }

  async findById(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) return null;
    const { password: _, ...userObj } = user.toObject();
    return userObj;
  }

  async login(dto: { username: string; password: string }) {
    const user = await this.userModel.findOne({ username: dto.username }).exec();
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const { password, ...userObj } = user.toObject();

    const payload = { sub: user._id.toString(), username: user.username };
    const access_token = this.jwtService.sign(payload);
    return { access_token, user: userObj };
  }
}
