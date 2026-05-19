/**
 * Testes unitários do AppointmentService.
 *
 * Estratégia: mocamos AppointmentRepository (não PrismaService diretamente),
 * porque o service depende do repositório — não do banco. Isso reflete a
 * separação de camadas que implementamos: o service não sabe que existe Prisma.
 *
 * Cada método do mock espelha um método real do AppointmentRepository.
 * O NestJS injeta o mock no lugar da implementação real via `useValue`.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentService } from './appointment.service';
import { AppointmentRepository } from './appointment.repository';
import { AppointmentStatus, BookingChannel } from '@prisma/client';
import { ApplicationException } from '../common/exceptions/application.exception';

// ─── FACTORY DE MOCK ──────────────────────────────────────────────────────────
//
// Retorna um novo objeto a cada chamada para garantir isolamento entre testes.
// Cada propriedade espelha um método público do AppointmentRepository.
//
function createRepoMock() {
  return {
    findCompanyByOwner:        jest.fn(),
    findActiveService:         jest.fn(),
    findSchedulesByDay:        jest.fn(),
    findScheduleContainingSlot: jest.fn(),
    findBlockedDate:           jest.fn(),
    findAppointmentsForDay:    jest.fn(),
    findConflictingAppointment: jest.fn(),
    findById:                  jest.fn(),
    findByIdAndCompany:        jest.fn(),
    findByIdAndClient:         jest.fn(),
    findManyByCompany:         jest.fn(),
    findManyByClient:          jest.fn(),
    create:                    jest.fn(),
    update:                    jest.fn(),
  };
}

type RepoMock = ReturnType<typeof createRepoMock>;

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

const MOCK_SERVICE = {
  id: 1,
  name: 'Corte de Cabelo',
  duration: 30,
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

// 2026-03-04 = quarta-feira (dayOfWeek = 3 em UTC)
const TEST_DATE = '2026-03-04';
const TEST_START_TIME = '2026-03-04T09:00:00.000Z';

// ═════════════════════════════════════════════════════════════════════════════
describe('AppointmentService', () => {
  let service: AppointmentService;
  let repoMock: RepoMock;

  beforeEach(async () => {
    repoMock = createRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        {
          provide: AppointmentRepository,
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 1 — Motor de slots disponíveis
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getAvailableSlots()', () => {

    it('deve retornar [] quando a data está bloqueada', async () => {
      repoMock.findBlockedDate.mockResolvedValue({ id: 99, reason: 'Feriado' });

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      expect(result).toEqual([]);
      // O sistema parou na verificação do bloqueio — não buscou agenda
      expect(repoMock.findSchedulesByDay).not.toHaveBeenCalled();
    });

    it('deve retornar [] quando não há agenda configurada para o dia', async () => {
      repoMock.findBlockedDate.mockResolvedValue(null);
      repoMock.findSchedulesByDay.mockResolvedValue([]);

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      expect(result).toEqual([]);
      expect(repoMock.findActiveService).not.toHaveBeenCalled();
    });

    it('deve lançar SERVICE_NOT_FOUND quando serviço não existe', async () => {
      repoMock.findBlockedDate.mockResolvedValue(null);
      repoMock.findSchedulesByDay.mockResolvedValue([MOCK_SCHEDULE]);
      repoMock.findActiveService.mockResolvedValue(null);

      await expect(
        service.getAvailableSlots(10, 999, TEST_DATE),
      ).rejects.toThrow(ApplicationException);
    });

    it('deve gerar 2 slots para agenda 09:00–10:00 com serviço de 30min', async () => {
      repoMock.findBlockedDate.mockResolvedValue(null);
      repoMock.findSchedulesByDay.mockResolvedValue([MOCK_SCHEDULE]);
      repoMock.findActiveService.mockResolvedValue(MOCK_SERVICE);
      repoMock.findAppointmentsForDay.mockResolvedValue([]);

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        startTime: '2026-03-04T09:00:00.000Z',
        endTime:   '2026-03-04T09:30:00.000Z',
      });
      expect(result[1]).toEqual({
        startTime: '2026-03-04T09:30:00.000Z',
        endTime:   '2026-03-04T10:00:00.000Z',
      });
    });

    it('deve remover slot que colide com agendamento existente', async () => {
      const existingAppointment = {
        id: 55,
        startTime: new Date('2026-03-04T09:00:00.000Z'),
        endTime:   new Date('2026-03-04T09:30:00.000Z'),
        status:    AppointmentStatus.CONFIRMED,
      };

      repoMock.findBlockedDate.mockResolvedValue(null);
      repoMock.findSchedulesByDay.mockResolvedValue([MOCK_SCHEDULE]);
      repoMock.findActiveService.mockResolvedValue(MOCK_SERVICE);
      repoMock.findAppointmentsForDay.mockResolvedValue([existingAppointment]);

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      // Slot 09:00 ocupado — só o das 09:30 sobra
      expect(result).toHaveLength(1);
      expect(result[0].startTime).toBe('2026-03-04T09:30:00.000Z');
    });

    it('deve retornar [] quando toda a agenda está ocupada', async () => {
      const appointments = [
        {
          id: 1,
          startTime: new Date('2026-03-04T09:00:00.000Z'),
          endTime:   new Date('2026-03-04T09:30:00.000Z'),
          status:    AppointmentStatus.CONFIRMED,
        },
        {
          id: 2,
          startTime: new Date('2026-03-04T09:30:00.000Z'),
          endTime:   new Date('2026-03-04T10:00:00.000Z'),
          status:    AppointmentStatus.PENDING,
        },
      ];

      repoMock.findBlockedDate.mockResolvedValue(null);
      repoMock.findSchedulesByDay.mockResolvedValue([MOCK_SCHEDULE]);
      repoMock.findActiveService.mockResolvedValue(MOCK_SERVICE);
      repoMock.findAppointmentsForDay.mockResolvedValue(appointments);

      const result = await service.getAvailableSlots(10, 1, TEST_DATE);

      expect(result).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 2 — Criação de agendamento
  // ═══════════════════════════════════════════════════════════════════════════
  describe('create()', () => {

    const baseDto = {
      companyId:   10,
      serviceId:   1,
      startTime:   TEST_START_TIME,
      clientName:  'Maria Silva',
      clientPhone: '11988887777',
      channel:     BookingChannel.WEB,
    };

    // Configura o "caminho feliz": todas as validações passam.
    // Cada teste individual sobrescreve apenas o mock que quer testar.
    function setupHappyPath() {
      repoMock.findActiveService.mockResolvedValue(MOCK_SERVICE);
      repoMock.findConflictingAppointment.mockResolvedValue(null);
      repoMock.findScheduleContainingSlot.mockResolvedValue(MOCK_SCHEDULE);
      repoMock.findBlockedDate.mockResolvedValue(null);
      repoMock.create.mockResolvedValue({
        id:        1,
        ...baseDto,
        startTime: new Date(TEST_START_TIME),
        endTime:   new Date('2026-03-04T09:30:00.000Z'),
        status:    AppointmentStatus.PENDING,
        service:   MOCK_SERVICE,
      });
    }

    it('deve lançar SERVICE_NOT_FOUND quando serviço não existe', async () => {
      setupHappyPath();
      repoMock.findActiveService.mockResolvedValue(null);

      await expect(service.create(baseDto)).rejects.toThrow(ApplicationException);
    });

    it('deve lançar APPOINTMENT_SLOT_TAKEN quando horário está ocupado', async () => {
      setupHappyPath();
      repoMock.findConflictingAppointment.mockResolvedValue({ id: 7 });

      await expect(service.create(baseDto)).rejects.toThrow('Este horário já está ocupado');
    });

    it('deve lançar SLOT_OUTSIDE_SCHEDULE quando fora do expediente', async () => {
      setupHappyPath();
      repoMock.findScheduleContainingSlot.mockResolvedValue(null);

      await expect(service.create(baseDto)).rejects.toThrow(
        'Horário fora do expediente da empresa',
      );
    });

    it('deve lançar DATE_BLOCKED quando a data está bloqueada', async () => {
      setupHappyPath();
      // O reason vira a mensagem de override no throwAppError
      repoMock.findBlockedDate.mockResolvedValue({ reason: 'Recesso' });

      await expect(service.create(baseDto)).rejects.toThrow('Recesso');
    });

    it('deve lançar DATE_BLOCKED com mensagem padrão quando reason está vazio', async () => {
      setupHappyPath();
      repoMock.findBlockedDate.mockResolvedValue({ reason: '' });

      await expect(service.create(baseDto)).rejects.toThrow('Esta data está bloqueada');
    });

    it('deve criar o agendamento com os dados corretos', async () => {
      setupHappyPath();

      const result = await service.create(baseDto, 42);

      expect(result.status).toBe(AppointmentStatus.PENDING);

      // Verificamos que o repositório recebeu os dados certos
      expect(repoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId:  42,
          companyId: 10,
          serviceId: 1,
          status:    AppointmentStatus.PENDING,
          channel:   BookingChannel.WEB,
        }),
      );
    });

    it('deve criar agendamento sem clientId quando não autenticado', async () => {
      setupHappyPath();

      await service.create(baseDto); // sem clientId

      expect(repoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: null }),
      );
    });

    it('deve calcular endTime corretamente com base na duração do serviço', async () => {
      setupHappyPath();

      await service.create(baseDto, 42);

      const callArgs = repoMock.create.mock.calls[0][0];
      const durationMs = MOCK_SERVICE.duration * 60 * 1000; // 30min em ms
      const diff = callArgs.endTime.getTime() - callArgs.startTime.getTime();

      expect(diff).toBe(durationMs);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 3 — Cancelamento pelo cliente
  // ═══════════════════════════════════════════════════════════════════════════
  describe('cancelByClient()', () => {

    const PENDING_APPT = {
      id:       1,
      clientId: 42,
      status:   AppointmentStatus.PENDING,
    };

    it('deve lançar APPOINTMENT_NOT_FOUND quando agendamento não pertence ao cliente', async () => {
      repoMock.findByIdAndClient.mockResolvedValue(null);

      await expect(service.cancelByClient(42, 999)).rejects.toThrow(ApplicationException);
    });

    it('deve lançar APPOINTMENT_ALREADY_CANCELLED quando já cancelado', async () => {
      repoMock.findByIdAndClient.mockResolvedValue({
        ...PENDING_APPT,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(service.cancelByClient(42, 1)).rejects.toThrow(
        'Agendamento já está cancelado',
      );
    });

    it('deve cancelar o agendamento com sucesso', async () => {
      repoMock.findByIdAndClient.mockResolvedValue(PENDING_APPT);
      repoMock.update.mockResolvedValue({
        ...PENDING_APPT,
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancelByClient(42, 1);

      expect(result.status).toBe(AppointmentStatus.CANCELLED);

      // O repositório deve receber o id e o novo status — nada mais
      expect(repoMock.update).toHaveBeenCalledWith(
        1,
        { status: AppointmentStatus.CANCELLED },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 4 — Listagem de agendamentos da empresa
  // ═══════════════════════════════════════════════════════════════════════════
  describe('findByCompanyOwner()', () => {

    const MOCK_COMPANY = { id: 10, ownerId: 99 };

    it('deve lançar COMPANY_NOT_FOUND quando empresa não existe', async () => {
      repoMock.findCompanyByOwner.mockResolvedValue(null);

      await expect(service.findByCompanyOwner(99)).rejects.toThrow(ApplicationException);
    });

    it('deve retornar resultado paginado', async () => {
      repoMock.findCompanyByOwner.mockResolvedValue(MOCK_COMPANY);
      repoMock.findManyByCompany.mockResolvedValue({
        data:  [{ id: 1 }, { id: 2 }],
        total: 2,
      });

      const result = await service.findByCompanyOwner(99, undefined, 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
    });

    it('deve calcular o skip corretamente', async () => {
      repoMock.findCompanyByOwner.mockResolvedValue(MOCK_COMPANY);
      repoMock.findManyByCompany.mockResolvedValue({ data: [], total: 0 });

      await service.findByCompanyOwner(99, undefined, 3, 10);

      // página 3, limit 10 → skip = (3-1) * 10 = 20
      expect(repoMock.findManyByCompany).toHaveBeenCalledWith(
        MOCK_COMPANY.id,
        undefined,
        20,
        10,
      );
    });
  });
});
