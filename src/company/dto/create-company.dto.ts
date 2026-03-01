import { IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(3, { message: 'Slug deve ter no mínimo 3 caracteres' })
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug deve conter apenas letras minúsculas, números e hifens (ex: minha-empresa)',
  })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;
}
