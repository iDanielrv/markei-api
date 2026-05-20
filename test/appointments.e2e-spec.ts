/**
 * Testes E2E do fluxo de agendamentos.
 *
 * Estratégia de seed:
 *  - Empresa, serviço e agenda são criados UMA VEZ em beforeAll (dados estáticos).
 *  - Agendamentos e datas bloqueadas são limpos em beforeEach (dados dinâmicos).
 *  - Isso evita recriar todo o schema entre testes, mantendo a suite rápida.
 *
 * Data usada nos testes: 2027-03-03 (Quarta-feira, dayOfWeek=3 em UTC).
 * Por que Quarta: o seed cria agenda apenas na Quarta (09:00–10:00).
 * Serviço de 30min → 2 slots disponíveis: 09:00–09:30 e 09:30–10:00.
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import {
  cleanDatabase,
  prismaTest,
  seedCompanyWithSchedule,
  seedClientUser,
} from './helpers/prisma';

type SeedResult = Awaited<ReturnType<typeof seedCompanyWithSchedule>>;

// Quarta-feira — coincide com o dayOfWeek=3 do seed
const WEDNESDAY = '2027-03-03';
const SLOT_09H = '2027-03-03T09:00:00.000Z';
const SLOT_09H30 = '2027-03-03T09:30:00.000Z';

// Domingo — sem agenda configurada
const SUNDAY = '2027-03-07';

describe('Appointments (e2e)', () => {
  let app: INestApplication;
  let company: SeedResult['company'];
  let service: SeedResult['service'];

  beforeAll(async () => {
    await cleanDatabase();
    app = await createTestApp();

    const seed = await seedCompanyWithSchedule();
    company = seed.company;
    service = seed.service;
  });

  beforeEach(async () => {
    // Limpa só os dados dinâmicos — empresa/serviço/agenda permanecem
    await prismaTest.appointment.deleteMany();
    await prismaTest.blockedDate.deleteMany();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
    await prismaTest.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /appointments/available-slots
  // ═══════════════════════════════════════════════════════════════
  describe('GET /appointments/available-slots', () => {
    it('retorna 2 slots para quarta-feira com serviço de 30min', async () => {
      const res = await request(app.getHttpServer())
        .get('/appointments/available-slots')
        .query({ companyId: company.id, serviceId: service.id, date: WEDNESDAY })
        .expect(200);

      const slots: { startTime: string; endTime: string }[] = res.body.data;

      expect(slots).toHaveLength(2);
      expect(slots[0].startTime).toBe(SLOT_09H);
      expect(slots[0].endTime).toBe(SLOT_09H30);
      expect(slots[1].startTime).toBe(SLOT_09H30);
    });

    it('retorna [] para domingo (sem agenda configurada)', async () => {
      const res = await request(app.getHttpServer())
        .get('/appointments/available-slots')
        .query({ companyId: company.id, serviceId: service.id, date: SUNDAY })
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('retorna [] quando a data está bloqueada', async () => {
      await prismaTest.blockedDate.create({
        data: {
          companyId: company.id,
          date: new Date(WEDNESDAY),
          reason: 'Feriado',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/appointments/available-slots')
        .query({ companyId: company.id, serviceId: service.id, date: WEDNESDAY })
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('remove slot ocupado por agendamento existente', async () => {
      // Ocupa o primeiro slot diretamente no banco
      await prismaTest.appointment.create({
        data: {
          companyId: company.id,
          serviceId: service.id,
          startTime: new Date(SLOT_09H),
          endTime: new Date(SLOT_09H30),
          status: 'CONFIRMED',
          channel: 'WEB',
          notes: '',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/appointments/available-slots')
        .query({ companyId: company.id, serviceId: service.id, date: WEDNESDAY })
        .expect(200);

      // Slot 09:00 ocupado — só o das 09:30 deve aparecer
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].startTime).toBe(SLOT_09H30);
    });

    it('retorna 400 sem os parâmetros obrigatórios', async () => {
      await request(app.getHttpServer())
        .get('/appointments/available-slots')
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /appointments/public (sem autenticação)
  // ═══════════════════════════════════════════════════════════════
  describe('POST /appointments/public', () => {
    const bookingPayload = {
      companyId: 0, // preenchido em cada teste
      serviceId: 0,
      startTime: SLOT_09H,
      clientName: 'Maria Teste',
      clientPhone: '11999990000',
      channel: 'WEB',
    };

    it('cria um agendamento público com status PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/appointments/public')
        .send({ ...bookingPayload, companyId: company.id, serviceId: service.id })
        .expect(201);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.clientName).toBe('Maria Teste');
    });

    it('retorna 409 quando o horário já está ocupado', async () => {
      // Primeiro agendamento — sucesso
      await request(app.getHttpServer())
        .post('/appointments/public')
        .send({ ...bookingPayload, companyId: company.id, serviceId: service.id })
        .expect(201);

      // Segundo agendamento no mesmo slot — conflito
      const res = await request(app.getHttpServer())
        .post('/appointments/public')
        .send({ ...bookingPayload, companyId: company.id, serviceId: service.id })
        .expect(409);

      expect(res.body.errorCode).toBe('APPOINTMENT_SLOT_TAKEN');
    });

    it('retorna 422 quando startTime está fora do expediente', async () => {
      const res = await request(app.getHttpServer())
        .post('/appointments/public')
        .send({
          ...bookingPayload,
          companyId: company.id,
          serviceId: service.id,
          startTime: '2027-03-03T11:00:00.000Z', // Fora das 09:00-10:00
        })
        .expect(422);

      expect(res.body.errorCode).toBe('SLOT_OUTSIDE_SCHEDULE');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /appointments (cliente autenticado)
  // ═══════════════════════════════════════════════════════════════
  describe('POST /appointments (autenticado)', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Cria e faz login com um cliente a cada teste
      const client = await seedClientUser();

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: client.username, password: 'senha123' });

      accessToken = loginRes.body.data.access_token;
    });

    afterEach(async () => {
      // Limpa os usuários criados no beforeEach (além dos agendamentos)
      await prismaTest.refreshToken.deleteMany();
      await prismaTest.user.deleteMany({ where: { role: 'USER' } });
    });

    it('cria o agendamento e vincula ao clientId do usuário logado', async () => {
      const res = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyId: company.id,
          serviceId: service.id,
          startTime: SLOT_09H,
          clientName: 'Ignorado',
          clientPhone: '00000000000',
          channel: 'WEB',
        })
        .expect(201);

      expect(res.body.data.status).toBe('PENDING');
      // clientId deve estar preenchido — não nulo
      expect(res.body.data.clientId).not.toBeNull();
    });

    it('retorna 401 sem token', async () => {
      await request(app.getHttpServer())
        .post('/appointments')
        .send({
          companyId: company.id,
          serviceId: service.id,
          startTime: SLOT_09H,
          clientName: 'Teste',
          clientPhone: '11999990000',
          channel: 'WEB',
        })
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PATCH /appointments/:id/cancel
  // ═══════════════════════════════════════════════════════════════
  describe('PATCH /appointments/:id/cancel', () => {
    let accessToken: string;
    let clientId: number;

    beforeEach(async () => {
      const client = await seedClientUser();
      clientId = client.id;

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: client.username, password: 'senha123' });

      accessToken = loginRes.body.data.access_token;
    });

    afterEach(async () => {
      await prismaTest.refreshToken.deleteMany();
      await prismaTest.user.deleteMany({ where: { role: 'USER' } });
    });

    it('cancela o agendamento do cliente logado', async () => {
      // Cria o agendamento via API (autenticado)
      const createRes = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          companyId: company.id,
          serviceId: service.id,
          startTime: SLOT_09H,
          clientName: 'Cliente',
          clientPhone: '11999990000',
          channel: 'WEB',
        });

      const appointmentId = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .patch(`/appointments/${appointmentId}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('retorna 404 ao tentar cancelar agendamento de outro cliente', async () => {
      // Agendamento criado diretamente no banco sem clientId (público)
      const appt = await prismaTest.appointment.create({
        data: {
          companyId: company.id,
          serviceId: service.id,
          startTime: new Date(SLOT_09H),
          endTime: new Date(SLOT_09H30),
          status: 'PENDING',
          channel: 'WEB',
          notes: '',
          clientId: null, // sem dono
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/appointments/${appt.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.errorCode).toBe('APPOINTMENT_NOT_FOUND');
    });

    it('retorna 409 ao tentar cancelar agendamento já cancelado', async () => {
      const appt = await prismaTest.appointment.create({
        data: {
          companyId: company.id,
          serviceId: service.id,
          startTime: new Date(SLOT_09H),
          endTime: new Date(SLOT_09H30),
          status: 'CANCELLED',
          channel: 'WEB',
          notes: '',
          clientId: clientId,
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/appointments/${appt.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);

      expect(res.body.errorCode).toBe('APPOINTMENT_ALREADY_CANCELLED');
    });
  });
});
