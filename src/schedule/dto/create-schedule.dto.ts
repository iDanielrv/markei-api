import { IsInt, Min, Max, IsString, Matches, IsBoolean, IsOptional } from 'class-validator';

export class CreateScheduleDto {
  @IsInt()
  @Min(0, { message: 'dayOfWeek deve ser entre 0 (Domingo) e 6 (Sábado)' })
  @Max(6)
  dayOfWeek: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime deve estar no formato HH:MM' })
  startTime: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime deve estar no formato HH:MM' })
  endTime: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
