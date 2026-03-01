import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { throwAppError } from '../common/errors/error-catalog';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { CreateBlockedDateDto } from './dto/create-blocked-date.dto';

@Injectable()
export class ScheduleService {
  constructor(private prisma: PrismaService) {}

  // ── Helper ────────────────────────────────────────────────────
  private async getCompanyByOwner(ownerId: number) {
    const company = await this.prisma.company.findUnique({ where: { ownerId } });
    if (!company) throwAppError('USER_NOT_FOUND', 'Empresa não encontrada. Crie sua empresa primeiro.');
    return company;
  }

  // ═══════════════════════════════════════════════════════════════
  //  WEEKLY SCHEDULE
  // ═══════════════════════════════════════════════════════════════

  // ── Criar slot de horário ─────────────────────────────────────
  async createSlot(ownerId: number, dto: CreateScheduleDto) {
    const company = await this.getCompanyByOwner(ownerId);

    // Validar que startTime < endTime
    if (dto.startTime >= dto.endTime) {
      throwAppError('VALIDATION_ERROR', 'startTime deve ser anterior a endTime');
    }

    return this.prisma.weeklySchedule.create({
      data: {
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        enabled: dto.enabled ?? true,
        companyId: company.id,
      },
    });
  }

  // ── Salvar semana inteira (bulk upsert) ───────────────────────
  async bulkSetSchedule(ownerId: number, slots: CreateScheduleDto[]) {
    const company = await this.getCompanyByOwner(ownerId);

    // Validar cada slot
    for (const s of slots) {
      if (s.startTime >= s.endTime) {
        throwAppError('VALIDATION_ERROR', `Dia ${s.dayOfWeek}: startTime deve ser anterior a endTime`);
      }
    }

    // Apagar horários antigos e inserir novos (transação)
    await this.prisma.$transaction([
      this.prisma.weeklySchedule.deleteMany({ where: { companyId: company.id } }),
      ...slots.map((s) =>
        this.prisma.weeklySchedule.create({
          data: {
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            enabled: s.enabled ?? true,
            companyId: company.id,
          },
        }),
      ),
    ]);

    // Retorna os novos horários
    return this.prisma.weeklySchedule.findMany({
      where: { companyId: company.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  // ── Listar horários da minha empresa ──────────────────────────
  async findAllByOwner(ownerId: number) {
    const company = await this.getCompanyByOwner(ownerId);
    return this.prisma.weeklySchedule.findMany({
      where: { companyId: company.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  // ── Atualizar slot ────────────────────────────────────────────
  async updateSlot(ownerId: number, slotId: number, dto: UpdateScheduleDto) {
    const company = await this.getCompanyByOwner(ownerId);
    const slot = await this.prisma.weeklySchedule.findFirst({
      where: { id: slotId, companyId: company.id },
    });
    if (!slot) throwAppError('USER_NOT_FOUND', 'Horário não encontrado');

    const newStart = dto.startTime ?? slot.startTime;
    const newEnd = dto.endTime ?? slot.endTime;
    if (newStart >= newEnd) {
      throwAppError('VALIDATION_ERROR', 'startTime deve ser anterior a endTime');
    }

    return this.prisma.weeklySchedule.update({
      where: { id: slotId },
      data: {
        ...(dto.startTime !== undefined && { startTime: dto.startTime }),
        ...(dto.endTime !== undefined && { endTime: dto.endTime }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    });
  }

  // ── Deletar slot ──────────────────────────────────────────────
  async removeSlot(ownerId: number, slotId: number) {
    const company = await this.getCompanyByOwner(ownerId);
    const slot = await this.prisma.weeklySchedule.findFirst({
      where: { id: slotId, companyId: company.id },
    });
    if (!slot) throwAppError('USER_NOT_FOUND', 'Horário não encontrado');

    await this.prisma.weeklySchedule.delete({ where: { id: slotId } });
    return { ok: true };
  }

  // ── Buscar horários por companyId (público) ───────────────────
  async findByCompanyId(companyId: number) {
    return this.prisma.weeklySchedule.findMany({
      where: { companyId, enabled: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  BLOCKED DATES
  // ═══════════════════════════════════════════════════════════════

  async addBlockedDate(ownerId: number, dto: CreateBlockedDateDto) {
    const company = await this.getCompanyByOwner(ownerId);

    return this.prisma.blockedDate.create({
      data: {
        date: new Date(dto.date),
        reason: dto.reason?.trim() || '',
        companyId: company.id,
      },
    });
  }

  async listBlockedDates(ownerId: number) {
    const company = await this.getCompanyByOwner(ownerId);
    return this.prisma.blockedDate.findMany({
      where: { companyId: company.id },
      orderBy: { date: 'asc' },
    });
  }

  async removeBlockedDate(ownerId: number, blockedDateId: number) {
    const company = await this.getCompanyByOwner(ownerId);
    const bd = await this.prisma.blockedDate.findFirst({
      where: { id: blockedDateId, companyId: company.id },
    });
    if (!bd) throwAppError('USER_NOT_FOUND', 'Data bloqueada não encontrada');

    await this.prisma.blockedDate.delete({ where: { id: blockedDateId } });
    return { ok: true };
  }
}
