import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CompanyModule } from '../company/company.module';
import { ServiceModule } from '../service/service.module';
import { AppointmentModule } from '../appointment/appointment.module';

@Module({
  imports: [CompanyModule, ServiceModule, AppointmentModule],
  providers: [TelegramService],
})
export class TelegramModule {}
