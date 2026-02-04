import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  async register(dto: any) {
    return { message: 'register placeholder', data: dto };
  }

  async login(dto: any) {
    return { message: 'login placeholder', data: dto };
  }

  async validateUser(username: string, password: string) {
    return null;
  }
}
