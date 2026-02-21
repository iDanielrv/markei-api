import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { throwAppError } from '../src/common/errors/error-catalog';

@Controller('test')
class TestController {
  @Get('bad')
  bad() {
    // validation-style error with details
    throwAppError('VALIDATION_ERROR', ['Campo obrigatório'], { field: 'name' });
  }
}

@Controller('test2')
class BoomController {
  @Get('boom')
  boom() {
    // generic error -> treated as 500
    throw new Error('Unexpected failure');
  }
}

describe('Error format (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns details for 4xx errors and normalizes message', async () => {
    const res = await request(app.getHttpServer()).get('/test/bad').expect(400);

    expect(res.body).toHaveProperty('statusCode', 400);
    expect(res.body).toHaveProperty('errorCode', 'VALIDATION_ERROR');
    expect(res.body).toHaveProperty('message');
    // message should be a string (normalized)
    expect(typeof res.body.message).toBe('string');
    // details should be present for 4xx
    expect(res.body).toHaveProperty('details');
    expect(res.body).not.toHaveProperty('errorId');
  });

  it('hides details and returns errorId for 5xx in production', async () => {
    const orig = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      const moduleFixture: TestingModule = await Test.createTestingModule({
        controllers: [BoomController],
      }).compile();

      const prodApp = moduleFixture.createNestApplication();
      prodApp.useGlobalFilters(new HttpExceptionFilter());
      await prodApp.init();

      const res = await request(prodApp.getHttpServer()).get('/test2/boom').expect(500);

      expect(res.body).toHaveProperty('statusCode', 500);
      expect(res.body).toHaveProperty('message');
      // details must be hidden in production for 5xx
      expect(res.body.details).toBeUndefined();
      // errorId should be present for 5xx
      expect(typeof res.body.errorId).toBe('string');

      await prodApp.close();
    } finally {
      process.env.NODE_ENV = orig;
    }
  });
});
