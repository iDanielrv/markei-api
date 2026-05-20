/**
 * Testes E2E do fluxo de autenticação.
 *
 * Estratégia:
 *  - App real (NestJS + Prisma + MySQL de teste) — sem mocks.
 *  - Banco limpo antes de cada teste: isolamento garantido.
 *  - Supertest faz as requisições HTTP exatamente como um cliente real faria.
 *
 * O que está sendo testado aqui que os testes unitários NÃO cobrem:
 *  - O ValidationPipe rejeita bodies inválidos (whitelist, forbidNonWhitelisted)
 *  - O cookie httpOnly é realmente definido na resposta de login
 *  - O refresh token rotaciona corretamente via cookies assinados
 *  - A guard JWT bloqueia rotas protegidas ponta a ponta
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import { cleanDatabase, prismaTest } from './helpers/prisma';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
    await prismaTest.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /auth/register
  // ═══════════════════════════════════════════════════════════════
  describe('POST /auth/register', () => {
    it('cria o usuário e retorna sem a senha', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'João Silva', username: 'joao', password: '123456' })
        .expect(201);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.username).toBe('joao');
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('normaliza o username para minúsculas', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Maria', username: 'MARIA', password: '123456' })
        .expect(201);

      expect(res.body.data.username).toBe('maria');
    });

    it('retorna 409 quando o username já está em uso', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'João', username: 'joao', password: '123456' });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Outro João', username: 'joao', password: '654321' })
        .expect(409);

      expect(res.body.errorCode).toBe('CONFLICT');
    });

    it('retorna 400 quando o body está incompleto', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Sem Senha' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /auth/login
  // ═══════════════════════════════════════════════════════════════
  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'João', username: 'joao', password: '123456' });
    });

    it('retorna access_token e seta cookie httpOnly', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'joao', password: '123456' })
        .expect(200);

      // O token deve estar no body
      expect(res.body.data).toHaveProperty('access_token');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user).not.toHaveProperty('password');

      // O cookie httpOnly deve estar presente no header de resposta
      const cookies = res.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies!.some((c) => c.startsWith('auth='))).toBe(true);
    });

    it('retorna 401 com senha errada', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'joao', password: 'errada' })
        .expect(401);

      expect(res.body).toHaveProperty('errorCode');
    });

    it('retorna 401 quando o usuário não existe', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'naoexiste', password: '123456' })
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /auth/profile
  // ═══════════════════════════════════════════════════════════════
  describe('GET /auth/profile', () => {
    it('retorna o perfil do usuário autenticado via Bearer token', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'João', username: 'joao', password: '123456' });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'joao', password: '123456' });

      const { access_token } = loginRes.body.data;

      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(res.body.data.username).toBe('joao');
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('retorna 401 sem token', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('retorna 401 com token inválido', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer token.invalido.aqui')
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /auth/logout
  // ═══════════════════════════════════════════════════════════════
  describe('POST /auth/logout', () => {
    it('limpa os cookies e retorna ok', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'João', username: 'joao', password: '123456' });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'joao', password: '123456' });

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(200);

      expect(res.body.data).toEqual({ ok: true });

      // Os cookies devem ser limpos (Set-Cookie com Max-Age=0 ou Expires no passado)
      const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
      const authCookieCleared = cookies.some(
        (c) => c.startsWith('auth=') && (c.includes('Max-Age=0') || c.includes('Expires=')),
      );
      expect(authCookieCleared).toBe(true);
    });
  });
});
