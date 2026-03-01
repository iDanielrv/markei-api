import { IsInt, Min, Max, IsString, Matches, IsBoolean, IsOptional } from 'class-validator';

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime deve estar no formato HH:MM' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime deve estar no formato HH:MM' })
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
