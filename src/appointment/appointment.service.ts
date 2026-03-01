import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { throwAppError } from '../common/errors/error-catalog';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentStatus, BookingChannel } from '@prisma/client';

@Injectable()
export class AppointmentService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════
  //  MOTOR DE SLOTS DISPONÍVEIS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Gera os horários disponíveis para uma empresa em uma data específica.
   *
   * Lógica:
   * 1. Verifica se a data é bloqueada
   * 2. Busca o WeeklySchedule do dia da semana
   * 3. Gera slots com base na duração do serviço
   * 4. Remove slots que colidem com agendamentos existentes
   */
  async getAvailableSlots(companyId: number, serviceId: number, dateStr: string) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getUTCDay(); // 0=Dom, 1=Seg...

    // 1. Data bloqueada?
    const startOfDay = new Date(dateStr);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const blocked = await this.prisma.blockedDate.findFirst({
      where: {
        companyId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });
    if (blocked) return []; // Dia bloqueado → sem slots

    // 2. Buscar horários do dia
    const schedules = await this.prisma.weeklySchedule.findMany({
      where: { companyId, dayOfWeek, enabled: true },
      orderBy: { startTime: 'asc' },
    });
    if (schedules.length === 0) return []; // Sem horário nesse dia

    // 3. Buscar serviço para saber duração
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, companyId, active: true },
    });
    if (!service) throwAppError('USER_NOT_FOUND', 'Serviço não encontrado ou inativo');

    const durationMs = service.duration * 60 * 1000;

    // 4. Buscar agendamentos existentes nesse dia (não cancelados)
    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        companyId,
        startTime: { gte: startOfDay },
        endTime: { lte: new Date(endOfDay.getTime() + 1) },
        status: { notIn: [AppointmentStatus.CANCELLED] },
      },
    });

    // 5. Gerar todos os slots possíveis
    const slots: { startTime: string; endTime: string }[] = [];

    for (const schedule of schedules) {
      const [startH, startM] = schedule.startTime.split(':').map(Number);
      const [endH, endM] = schedule.endTime.split(':').map(Number);

      const scheduleStart = new Date(dateStr);
      scheduleStart.setUTCHours(startH, startM, 0, 0);

      const scheduleEnd = new Date(dateStr);
      scheduleEnd.setUTCHours(endH, endM, 0, 0);

      let cursor = scheduleStart.getTime();

      while (cursor + durationMs <= scheduleEnd.getTime()) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor + durationMs);

        // Verificar colisão com agendamentos existentes
        const hasConflict = existingAppointments.some((appt) => {
          const apptStart = new Date(appt.startTime).getTime();
          const apptEnd = new Date(appt.endTime).getTime();
          return slotStart.getTime() < apptEnd && slotEnd.getTime() > apptStart;
        });

        if (!hasConflict) {
          slots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
          });
        }

        cursor += durationMs; // Avança pela duração do serviço (sem buffer)
      }
    }

    return slots;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CRUD DE AGENDAMENTOS
  // ═══════════════════════════════════════════════════════════════

  // ── Criar agendamento (cliente ou empresa) ────────────────────
  async create(dto: CreateAppointmentDto, clientId?: number) {
    // Validar serviço
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, companyId: dto.companyId, active: true },
    });
    if (!service) throwAppError('USER_NOT_FOUND', 'Serviço não encontrado ou inativo');

    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + service.duration * 60 * 1000);

    // Validar que o slot está disponível
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        companyId: dto.companyId,
        status: { notIn: [AppointmentStatus.CANCELLED] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (conflict) throwAppError('CONFLICT', 'Este horário já está ocupado');

    // Validar que está dentro do horário semanal
    const dayOfWeek = startTime.getUTCDay();
    const timeStr = `${String(startTime.getUTCHours()).padStart(2, '0')}:${String(startTime.getUTCMinutes()).padStart(2, '0')}`;
    const endTimeStr = `${String(endTime.getUTCHours()).padStart(2, '0')}:${String(endTime.getUTCMinutes()).padStart(2, '0')}`;

    const validSchedule = await this.prisma.weeklySchedule.findFirst({
      where: {
        companyId: dto.companyId,
        dayOfWeek,
        enabled: true,
        startTime: { lte: timeStr },
        endTime: { gte: endTimeStr },
      },
    });
    if (!validSchedule) throwAppError('VALIDATION_ERROR', 'Horário fora do expediente da empresa');

    // Validar data não bloqueada
    const dateStart = new Date(startTime);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(startTime);
    dateEnd.setUTCHours(23, 59, 59, 999);

    const blocked = await this.prisma.blockedDate.findFirst({
      where: {
        companyId: dto.companyId,
        date: { gte: dateStart, lte: dateEnd },
      },
    });
    if (blocked) throwAppError('VALIDATION_ERROR', `Data bloqueada: ${blocked.reason || 'indisponível'}`);

    return this.prisma.appointment.create({
      data: {
        startTime,
        endTime,
        status: AppointmentStatus.PENDING,
        channel: dto.channel || BookingChannel.WEB,
        notes: dto.notes?.trim() || '',
        clientId: clientId || null,
        clientName: dto.clientName?.trim() || '',
        clientPhone: dto.clientPhone?.trim() || '',
        companyId: dto.companyId,
        serviceId: dto.serviceId,
      },
      include: { service: true },
    });
  }

  // ── Listar agendamentos da empresa ────────────────────────────
  async findByCompanyOwner(ownerId: number, status?: AppointmentStatus) {
    const company = await this.prisma.company.findUnique({ where: { ownerId } });
    if (!company) throwAppError('USER_NOT_FOUND', 'Empresa não encontrada');

    return this.prisma.appointment.findMany({
      where: {
        companyId: company.id,
        ...(status && { status }),
      },
      include: { service: true, client: { omit: { password: true } } },
      orderBy: { startTime: 'asc' },
    });
  }

  // ── Listar agendamentos do cliente ────────────────────────────
  async findByClient(clientId: number) {
    return this.prisma.appointment.findMany({
      where: { clientId },
      include: { service: true, company: true },
      orderBy: { startTime: 'desc' },
    });
  }

  // ── Buscar agendamento por ID ─────────────────────────────────
  async findOne(id: number) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { service: true, company: true, client: { omit: { password: true } } },
    });
    if (!appt) throwAppError('USER_NOT_FOUND', 'Agendamento não encontrado');
    return appt;
  }

  // ── Atualizar status/notas (empresa) ──────────────────────────
  async update(ownerId: number, appointmentId: number, dto: UpdateAppointmentDto) {
    const company = await this.prisma.company.findUnique({ where: { ownerId } });
    if (!company) throwAppError('USER_NOT_FOUND', 'Empresa não encontrada');

    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, companyId: company.id },
    });
    if (!appt) throwAppError('USER_NOT_FOUND', 'Agendamento não encontrado');

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes.trim() }),
      },
      include: { service: true },
    });
  }

  // ── Cancelar agendamento (cliente) ────────────────────────────
  async cancelByClient(clientId: number, appointmentId: number) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clientId },
    });
    if (!appt) throwAppError('USER_NOT_FOUND', 'Agendamento não encontrado');

    if (appt.status === AppointmentStatus.CANCELLED) {
      throwAppError('VALIDATION_ERROR', 'Agendamento já está cancelado');
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CANCELLED },
      include: { service: true },
    });
  }
}
