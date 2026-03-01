import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL || 'mysql://notesapp:notesapp@localhost:3306/notesapp';
const parsed = new URL(url);
const adapter = new PrismaMariaDb({
  host: parsed.hostname,
  port: Number(parsed.port) || 3306,
  user: parsed.username,
  password: parsed.password,
  database: parsed.pathname.replace('/', ''),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seed...');

  // ── 1. Usuário dono da empresa ──────────────────────────────
  const passwordHash = await bcrypt.hash('teste123', 12);

  const owner = await prisma.user.upsert({
    where: { username: 'barbearia_teste' },
    update: {},
    create: {
      name: 'João da Silva',
      username: 'barbearia_teste',
      phone: '11999990000',
      password: passwordHash,
      role: Role.COMPANY,
    },
  });
  console.log(`✅ Usuário criado: ${owner.username} (id=${owner.id})`);

  // ── 2. Empresa ──────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { slug: 'barbearia-do-joao' },
    update: {},
    create: {
      name: 'Barbearia do João',
      slug: 'barbearia-do-joao',
      description: 'A melhor barbearia do bairro. Cortes modernos e clássicos.',
      phone: '11999990000',
      address: 'Rua das Flores, 123 - São Paulo, SP',
      timezone: 'America/Sao_Paulo',
      ownerId: owner.id,
    },
  });
  console.log(`✅ Empresa criada: ${company.name} (slug=${company.slug})`);

  // ── 3. Serviços ─────────────────────────────────────────────
  const services = [
    {
      name: 'Corte de Cabelo',
      description: 'Corte masculino completo com finalização.',
      duration: 30,
      price: 4500, // R$ 45,00
    },
    {
      name: 'Barba',
      description: 'Modelagem e hidratação de barba.',
      duration: 20,
      price: 3000, // R$ 30,00
    },
    {
      name: 'Corte + Barba',
      description: 'Combo completo: corte e barba com hidratação.',
      duration: 50,
      price: 6500, // R$ 65,00
    },
  ];

  for (const svc of services) {
    const existing = await prisma.service.findFirst({
      where: { companyId: company.id, name: svc.name },
    });
    if (!existing) {
      await prisma.service.create({
        data: { ...svc, companyId: company.id },
      });
      console.log(`  ✅ Serviço: ${svc.name}`);
    } else {
      console.log(`  ⏭️  Serviço já existe: ${svc.name}`);
    }
  }

  // ── 4. Agenda semanal (Seg–Sex 09:00–18:00, Sáb 09:00–13:00) ─
  const schedules = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }, // Segunda
    { dayOfWeek: 2, startTime: '09:00', endTime: '18:00' }, // Terça
    { dayOfWeek: 3, startTime: '09:00', endTime: '18:00' }, // Quarta
    { dayOfWeek: 4, startTime: '09:00', endTime: '18:00' }, // Quinta
    { dayOfWeek: 5, startTime: '09:00', endTime: '18:00' }, // Sexta
    { dayOfWeek: 6, startTime: '09:00', endTime: '13:00' }, // Sábado
  ];

  for (const s of schedules) {
    await prisma.weeklySchedule.upsert({
      where: {
        companyId_dayOfWeek_startTime: {
          companyId: company.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
        },
      },
      update: {},
      create: { ...s, companyId: company.id },
    });
  }
  console.log('✅ Agenda semanal configurada (Seg–Sex 09-18h, Sáb 09-13h)');

  // ── 5. Usuário cliente para teste ───────────────────────────
  const client = await prisma.user.upsert({
    where: { username: 'cliente_teste' },
    update: {},
    create: {
      name: 'Cliente Teste',
      username: 'cliente_teste',
      phone: '11888880000',
      password: await bcrypt.hash('teste123', 12),
      role: Role.USER,
    },
  });
  console.log(`✅ Cliente de teste: ${client.username} (id=${client.id})`);

  console.log('\n🎉 Seed concluído!');
  console.log('─────────────────────────────────────────');
  console.log('📋 Dados para teste:');
  console.log(`   Empresa slug  : barbearia-do-joao`);
  console.log(`   Dono login    : barbearia_teste / teste123`);
  console.log(`   Cliente login : cliente_teste / teste123`);
  console.log('\n🤖 No Telegram, envie:');
  console.log('   /agendar barbearia-do-joao');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
