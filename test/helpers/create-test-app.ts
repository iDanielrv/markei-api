import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * Cria e inicializa o app NestJS com a mesma configuração do main.ts.
 *
 * Por que isso existe: cada E2E spec precisa de um app com pipes, filtros e
 * interceptors registrados — sem isso os testes não refletem o comportamento real.
 * Centralizar aqui evita duplicação entre arquivos de teste.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.use(cookieParser(process.env.COOKIE_SECRET || 'test-cookie-secret'));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  await app.init();
  return app;
}
