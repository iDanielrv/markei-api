import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CompanyModule } from './company/company.module';
import { ServiceModule } from './service/service.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AppointmentModule } from './appointment/appointment.module';
import 'dotenv/config';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CompanyModule,
    ServiceModule,
    ScheduleModule,
    AppointmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
