import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBlockedDateDto {
  @IsDateString({}, { message: 'date deve estar no formato ISO (YYYY-MM-DD)' })
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
