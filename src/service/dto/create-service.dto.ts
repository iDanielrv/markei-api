import { IsString, MinLength, MaxLength, IsInt, Min, Max, IsOptional, IsBoolean } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt({ message: 'Duração deve ser um número inteiro (minutos)' })
  @Min(5, { message: 'Duração mínima: 5 minutos' })
  @Max(480, { message: 'Duração máxima: 480 minutos (8h)' })
  duration: number;

  @IsOptional()
  @IsInt({ message: 'Preço deve ser um número inteiro em centavos' })
  @Min(0)
  price?: number;
}
