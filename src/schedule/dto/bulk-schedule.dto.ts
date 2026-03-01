import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateScheduleDto } from './create-schedule.dto';

/**
 * Permite enviar a semana inteira de uma vez.
 * Ex: [{ dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }, ...]
 */
export class BulkScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleDto)
  schedules: CreateScheduleDto[];
}
