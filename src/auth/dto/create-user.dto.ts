import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(3, { message: 'Usuário deve ter no mínimo 3 caracteres' })
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'Usuário pode conter apenas letras, números, ponto, hífen e underline',
  })
  username: string;

  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  @MaxLength(128)
  password: string;
}
