import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response.interceptor';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Cookie parser
  app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-cookie-secret'));

  // Global exception filter — padroniza formato de erros
  app.useGlobalFilters(new HttpExceptionFilter());
  // Global response interceptor — normaliza respostas de sucesso
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // CORS — suporta múltiplas origens via FRONTEND_URLS
  const frontendEnv =
    process.env.FRONTEND_URLS ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000';
  const allowedOrigins = frontendEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  console.log('Allowed CORS origins:', allowedOrigins);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 8088);
  console.log(`API running on port ${process.env.PORT ?? 8088}`);
}

void bootstrap();
