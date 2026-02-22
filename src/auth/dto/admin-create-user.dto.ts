import { IsString, MinLength, MaxLength, IsOptional, Matches, IsEnum } from 'class-validator';
import { Role } from '../schemas/user.schema';

export class AdminCreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @IsEnum(Role)
  role: Role;
}
