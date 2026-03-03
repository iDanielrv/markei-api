/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  AULA 2 – Testando um SERVICE com MOCKS (sem banco de dados real)       │
 * │                                                                         │
 * │  Por que usar mocks?                                                    │
 * │   • Testes unitários precisam ser RÁPIDOS e ISOLADOS                   │
 * │   • Um teste que fala com o banco é um teste de integração              │
 * │   • Com mocks, controlamos exatamente o que o banco "retorna"           │
 * │     em cada cenário, sem precisar de dados reais                        │
 * │                                                                         │
 * │  O que é um mock?                                                       │
 * │   • Um objeto "fake" que substitui a dependência real (PrismaService)   │
 * │   • Você define o retorno de cada método com jest.fn()                  │
 * │   • Isso permite simular: sucesso, falha, dados específicos             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * CONCEITOS NOVOS NESTE ARQUIVO:
 *  - jest.fn()              → cria uma função falsa rastreável
 *  - mockResolvedValue()    → define o que a função async vai resolver
 *  - mockResolvedValueOnce()→ idem, mas só na primeira chamada
 *  - rejects.toThrow()      → verifica que uma Promise rejeitou
 *  - toHaveBeenCalledWith() → verifica os argumentos da chamada
 *  - beforeEach()           → roda antes de CADA teste (reset de estado)
 *  - Test.createTestingModule → container de DI do NestJS para testes
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentService } from './appointment.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, BookingChannel } from '@prisma/client';
import { ApplicationException } from '../common/exceptions/application.exception';

// ─── FACTORY DE MOCK ──────────────────────────────────────────────────────────
//
// Criamos uma função que RETORNA um novo objeto falso do Prisma a cada chamada.
// Por que função e não objeto direto? Para o beforeEach poder criar um mock
// limpo (sem histórico de chamadas) antes de cada teste.
//
// Cada método é um jest.fn() — uma função que:
//   • pode ter seu retorno definido com .mockResolvedValue()
//   • registra quantas vezes foi chamada e com quais argumentos
//
function createPrismaMock() {
  return {
    blockedDate: {
      findFirst: jest.fn(),
    },
    weeklySchedule: {
      findMany:  jest.fn(),
      findFirst: jest.fn(),
    },
    service: {
      findFirst: jest.fn(),
    },
    appointment: {
      findMany:  jest.fn(),
      findFirst: jest.fn(),
      create:    jest.fn(),
      update:    jest.fn(),
      count:     jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
    },
  };
}

// ─── Tipo auxiliar ────────────────────────────────────────────────────────────
// ReturnType + typeof deduz automaticamente o tipo do mock sem precisar
// escrever manualmente.
type PrismaMock = ReturnType<typeof createPrismaMock>;

// ─── DADOS DE EXEMPLO (fixtures) ─────────────────────────────────────────────
//
// "Fixtures" são dados fixos que representam o estado do banco.
// Definimos aqui para reutilizar nos testes sem repetição.

const MOCK_SERVICE = {
  id: 1,
  name: 'Corte de Cabelo',
  duration: 30, // minutos
  price: 4500,
  companyId: 10,
  active: true,
};

const MOCK_SCHEDULE = {
  id: 1,
  companyId: 10,
  dayOfWeek: 3, // Quarta-feira
  startTime: '09:00',
  endTime: '10:00',
  enabled: true,
};

// Data de teste: 2026-03-04 = quarta-feira (dayOfWeek = 3 UTC)
const TEST_DATE = '2026-03-04';
const TEST_START_TIME = '2026-03-04T09:00:00.000Z'; // 09:00 UTC quarta

// ═════════════════════════════════════════════════════════════════════════════
describe('AppointmentService', () => {
  let service: AppointmentService;
  let prismaMock: PrismaMock;

  // ─── beforeEach ────────────────────────────────────────────────────────────
  //
  // O beforeEach() roda ANTES DE CADA teste individual (cada it() ).
  // Aqui recriamos o módulo NestJS e o mock do Prisma do zero,
  // garantindo que um teste não "contamina" o estado do próximo.
  //
  beforeEach(async () => {
    prismaMock = createPrismaMock();

    // Test.createTestingModule é o container de DI do NestJS para testes.
    // Passamos o serviço real (AppointmentService) mas substituímos
    // a dependência PrismaService pelo nosso objeto fake via `useValue`.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        {
          provide: PrismaService,   // "quando alguém pedir PrismaService…"
          useValue: prismaMock,     // "…entregue este mock"
        },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 1: Motor de Slots Disponíveis
  // Testamos a função mais crítica do sistema: getAvailableSlots()
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getAvailableSlots()', () => {

    it('deve retornar [] quando a data está bloqueada', async () => {
      // Cenário: o dono bloqueou esta quarta-feira (feriado, etc.)

      // mockResolvedValue define o retorno da função async.
      // Como blockedDate.findFirst retorna algo (não null), o sistema entende
      // que a data está bloqueada e deve retornar slots vazia.
      prismaMock.blockedDate.findFirst.mockResolvedValue({ id: 99, reason: 'Feriado' });

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      expect(result).toEqual([]);

      // Verificamos também que o sistema PAROU aqui e NÃO consultou
      // a agenda semanal (pois não havia necessidade).
      expect(prismaMock.weeklySchedule.findMany).not.toHaveBeenCalled();
    });

    it('deve retornar [] quando não há agenda configurada para o dia', async () => {
      // Cenário: empresa não trabalha às quartas-feiras
      prismaMock.blockedDate.findFirst.mockResolvedValue(null);      // data livre
      prismaMock.weeklySchedule.findMany.mockResolvedValue([]);       // sem agenda
      // Não precisamos configurar os demais mocks, pois o código para aqui.

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      expect(result).toEqual([]);
    });

    it('deve gerar os slots corretos quando há agenda e serviço', async () => {
      // Cenário feliz: agenda 09:00–10:00, serviço de 30 min
      // Resultado esperado: dois slots (09:00–09:30 e 09:30–10:00)

      prismaMock.blockedDate.findFirst.mockResolvedValue(null);
      prismaMock.weeklySchedule.findMany.mockResolvedValue([MOCK_SCHEDULE]);
      prismaMock.service.findFirst.mockResolvedValue(MOCK_SERVICE);
      prismaMock.appointment.findMany.mockResolvedValue([]); // nenhum agendamento existente

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      // 09:00–10:00 com slots de 30min = 2 slots
      expect(result).toHaveLength(2);

      // Verificamos o horário do primeiro slot em UTC
      expect(result[0].startTime).toBe('2026-03-04T09:00:00.000Z');
      expect(result[0].endTime).toBe('2026-03-04T09:30:00.000Z');

      expect(result[1].startTime).toBe('2026-03-04T09:30:00.000Z');
      expect(result[1].endTime).toBe('2026-03-04T10:00:00.000Z');
    });

    it('deve remover o slot que colide com agendamento existente', async () => {
      // Cenário: existe um agendamento das 09:00–09:30
      // O slot das 09:00 deve sumir, mas o das 09:30 ainda aparece

      const existingAppointment = {
        id: 55,
        startTime: new Date('2026-03-04T09:00:00.000Z'),
        endTime:   new Date('2026-03-04T09:30:00.000Z'),
        status:    AppointmentStatus.CONFIRMED,
      };

      prismaMock.blockedDate.findFirst.mockResolvedValue(null);
      prismaMock.weeklySchedule.findMany.mockResolvedValue([MOCK_SCHEDULE]);
      prismaMock.service.findFirst.mockResolvedValue(MOCK_SERVICE);
      prismaMock.appointment.findMany.mockResolvedValue([existingAppointment]);

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      // Só o segundo slot sobra
      expect(result).toHaveLength(1);
      expect(result[0].startTime).toBe('2026-03-04T09:30:00.000Z');
    });

    it('deve retornar [] quando serviço não existe ou está inativo', async () => {
      prismaMock.blockedDate.findFirst.mockResolvedValue(null);
      prismaMock.weeklySchedule.findMany.mockResolvedValue([MOCK_SCHEDULE]);
      prismaMock.service.findFirst.mockResolvedValue(null); // serviço não encontrado

      // throwAppError lança ApplicationException, que estende HttpException
      await expect(
        service.getAvailableSlots(10, 999, TEST_DATE),
      ).rejects.toThrow(ApplicationException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 2: Criação de Agendamento
  // Testamos as quatro validações antes de salvar um novo agendamento.
  // ═══════════════════════════════════════════════════════════════════════════
  describe('create()', () => {

    // ── DTO base usado em todos os testes de criação ──────────────────────
    const baseDto = {
      companyId:   10,
      serviceId:   1,
      startTime:   TEST_START_TIME,
      clientName:  'Maria Silva',
      clientPhone: '11988887777',
      channel:     BookingChannel.WEB,
    };

    // Função auxiliar que configura o "caminho feliz" (todas as verificações passam)
    // Cada teste vai sobrescrever apenas o mock que quer testar.
    function setupHappyPath() {
      prismaMock.service.findFirst.mockResolvedValue(MOCK_SERVICE);
      prismaMock.appointment.findFirst.mockResolvedValue(null);   // sem conflito
      prismaMock.weeklySchedule.findFirst.mockResolvedValue(MOCK_SCHEDULE); // dentro do expediente
      prismaMock.blockedDate.findFirst.mockResolvedValue(null);   // data livre
      prismaMock.appointment.create.mockResolvedValue({
        id: 1,
        ...baseDto,
        startTime: new Date(TEST_START_TIME),
        endTime:   new Date('2026-03-04T09:30:00.000Z'),
        status:    AppointmentStatus.PENDING,
        service:   MOCK_SERVICE,
      });
    }

    it('deve lançar erro quando o serviço não existe ou está inativo', async () => {
      setupHappyPath();
      // Sobrescreve: serviço não encontrado
      prismaMock.service.findFirst.mockResolvedValue(null);

      await expect(service.create(baseDto)).rejects.toThrow(ApplicationException);
    });

    it('deve lançar erro quando já existe agendamento no mesmo horário', async () => {
      setupHappyPath();
      // Sobrescreve: conflito encontrado
      prismaMock.appointment.findFirst.mockResolvedValue({ id: 7 });

      await expect(service.create(baseDto)).rejects.toThrow(ApplicationException);

      // Verificamos que a mensagem de erro é sobre conflito
      await expect(service.create(baseDto)).rejects.toThrow('Este horário já está ocupado');
    });

    it('deve lançar erro quando o horário está fora do expediente', async () => {
      setupHappyPath();
      // Sobrescreve: nenhuma agenda válida encontrada para esse horário
      prismaMock.weeklySchedule.findFirst.mockResolvedValue(null);

      await expect(service.create(baseDto)).rejects.toThrow(
        'Horário fora do expediente da empresa',
      );
    });

    it('deve lançar erro quando a data está bloqueada', async () => {
      setupHappyPath();
      // Sobrescreve: data bloqueada
      prismaMock.blockedDate.findFirst.mockResolvedValue({ reason: 'Recesso' });

      await expect(service.create(baseDto)).rejects.toThrow('Data bloqueada: Recesso');
    });

    it('deve criar o agendamento quando tudo está válido', async () => {
      setupHappyPath();

      const result = await service.create(baseDto, 42 /* clientId */);

      // Verificamos que o agendamento foi criado com o status correto
      expect(result.status).toBe(AppointmentStatus.PENDING);

      // toHaveBeenCalledWith verifica os argumentos com que o mock foi chamado.
      // É útil para garantir que o serviço está passando os dados corretos para o banco.
      expect(prismaMock.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId:  42,
            companyId: 10,
            serviceId: 1,
            status:    AppointmentStatus.PENDING,
            channel:   BookingChannel.WEB,
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 3: Cancelamento pelo cliente
  // Testamos as regras de negócio do cancelamento.
  // ═══════════════════════════════════════════════════════════════════════════
  describe('cancelByClient()', () => {

    const PENDING_APPT = {
      id: 1,
      clientId: 42,
      status: AppointmentStatus.PENDING,
    };

    it('deve lançar erro quando o agendamento não pertence ao cliente', async () => {
      // findFirst retorna null: o registro não foi encontrado com clientId + id
      prismaMock.appointment.findFirst.mockResolvedValue(null);

      await expect(service.cancelByClient(42, 999)).rejects.toThrow(ApplicationException);
    });

    it('deve lançar erro quando o agendamento já está cancelado', async () => {
      // O agendamento existe, mas já está CANCELLED
      prismaMock.appointment.findFirst.mockResolvedValue({
        ...PENDING_APPT,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(service.cancelByClient(42, 1)).rejects.toThrow(
        'Agendamento já está cancelado',
      );
    });

    it('deve cancelar o agendamento com sucesso', async () => {
      prismaMock.appointment.findFirst.mockResolvedValue(PENDING_APPT);
      prismaMock.appointment.update.mockResolvedValue({
        ...PENDING_APPT,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancelByClient(42, 1);

      expect(result.status).toBe(AppointmentStatus.CANCELLED);

      // Garantimos que o update foi chamado com os parâmetros corretos
      expect(prismaMock.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data:  { status: AppointmentStatus.CANCELLED },
        }),
      );
    });
  });
});
