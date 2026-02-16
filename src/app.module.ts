import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import 'dotenv/config';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forRoot(process.env.DB_URL || 'mongodb://localhost:27017/notesapp'),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
