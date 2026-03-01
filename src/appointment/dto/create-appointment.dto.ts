import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { BookingChannel } from '@prisma/client';

export class CreateAppointmentDto {
  @IsInt()
  serviceId: number;

  @IsInt()
  companyId: number;

  @IsDateString({}, { message: 'startTime deve estar em formato ISO (ex: 2026-03-15T10:00:00.000Z)' })
  startTime: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  clientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsEnum(BookingChannel)
  channel?: BookingChannel;
}
