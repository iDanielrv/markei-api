import { PrismaClient, Role } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';

function buildClient(): PrismaClient {
  const url =
    process.env.DATABASE_URL ||
    'mysql://notesapp:notesapp@localhost:3306/notesapp_test';
  const parsed = new URL(url);
  const adapter = new PrismaMariaDb({
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace('/', ''),
  });
  return new PrismaClient({ adapter });
}

export const prismaTest = buildClient();

/**
 * Apaga todos os dados na ordem correta respeitando foreign keys.
 * Deve ser chamado em beforeEach/afterAll para garantir isolamento entre testes.
 */
export async function cleanDatabase(): Promise<void> {
  await prismaTest.appointment.deleteMany();
  await prismaTest.blockedDate.deleteMany();
  await prismaTest.weeklySchedule.deleteMany();
  await prismaTest.service.deleteMany();
  await prismaTest.company.deleteMany();
  await prismaTest.refreshToken.deleteMany();
  await prismaTest.user.deleteMany();
}

/**
 * Cria um conjunto completo de dados: empresa, serviço e agenda semanal.
 * Usado pelos testes de agendamento para ter uma base real com que trabalhar.
 *
 * Agenda criada: Quarta-feira (dayOfWeek=3), 09:00–10:00 UTC.
 * Serviço criado: "Corte", 30 minutos → gera 2 slots no período.
 */
export async function seedCompanyWithSchedule() {
  const passwordHash = await bcrypt.hash('senha123', 10);

  const owner = await prismaTest.user.create({
    data: {
      name: 'Empresa E2E',
      username: 'empresa_e2e',
      phone: '11999990001',
      password: passwordHash,
      role: Role.COMPANY,
    },
  });

  const company = await prismaTest.company.create({
    data: {
      name: 'Barbearia E2E',
      slug: 'barbearia-e2e',
      description: 'Barbearia criada para testes E2E',
      ownerId: owner.id,
    },
  });

  const service = await prismaTest.service.create({
    data: {
      name: 'Corte',
      description: 'Corte de cabelo',
      duration: 30,
      price: 4500,
      companyId: company.id,
    },
  });

  await prismaTest.weeklySchedule.create({
    data: {
      companyId: company.id,
      dayOfWeek: 3,
      startTime: '09:00',
      endTime: '10:00',
    },
  });

  return { owner, company, service };
}

export async function seedClientUser() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  return prismaTest.user.create({
    data: {
      name: 'Cliente E2E',
      username: 'cliente_e2e',
      phone: '11888880001',
      password: passwordHash,
      role: Role.USER,
    },
  });
}
