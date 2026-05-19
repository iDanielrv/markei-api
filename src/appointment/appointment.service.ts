import { Injectable } from '@nestjs/common';
import { throwAppError } from '../common/errors/error-catalog';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentStatus, BookingChannel } from '@prisma/client';
import { paginate } from '../common/helpers/paginate.helper';
import { AppointmentRepository } from './appointment.repository';

@Injectable()
export class AppointmentService {
  constructor(private readonly repo: AppointmentRepository) {}

  // ═══════════════════════════════════════════════════════════════
  //  MOTOR DE SLOTS DISPONÍVEIS
  // ═══════════════════════════════════════════════════════════════

  async getAvailableSlots(companyId: number, serviceId: number, dateStr: string) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getUTCDay();

    const startOfDay = new Date(dateStr);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const blocked = await this.repo.findBlockedDate(companyId, startOfDay, endOfDay);
    if (blocked) return [];

    const schedules = await this.repo.findSchedulesByDay(companyId, dayOfWeek);
    if (schedules.length === 0) return [];

    const service = await this.repo.findActiveService(serviceId, companyId);
    if (!service) throwAppError('SERVICE_NOT_FOUND');

    const durationMs = service.duration * 60 * 1000;
    const existingAppointments = await this.repo.findAppointmentsForDay(
      companyId,
      startOfDay,
      endOfDay,
    );

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

        cursor += durationMs;
      }
    }

    return slots;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CRUD DE AGENDAMENTOS
  // ═══════════════════════════════════════════════════════════════

  async create(dto: CreateAppointmentDto, clientId?: number) {
    const service = await this.repo.findActiveService(dto.serviceId, dto.companyId);
    if (!service) throwAppError('SERVICE_NOT_FOUND');

    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + service.duration * 60 * 1000);

    const conflict = await this.repo.findConflictingAppointment(
      dto.companyId,
      startTime,
      endTime,
    );
    if (conflict) throwAppError('APPOINTMENT_SLOT_TAKEN');

    const dayOfWeek = startTime.getUTCDay();
    const startTimeStr = toTimeStr(startTime);
    const endTimeStr = toTimeStr(endTime);

    const validSchedule = await this.repo.findScheduleContainingSlot(
      dto.companyId,
      dayOfWeek,
      startTimeStr,
      endTimeStr,
    );
    if (!validSchedule) throwAppError('SLOT_OUTSIDE_SCHEDULE');

    const dateStart = new Date(startTime);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(startTime);
    dateEnd.setUTCHours(23, 59, 59, 999);

    const blocked = await this.repo.findBlockedDate(dto.companyId, dateStart, dateEnd);
    if (blocked) throwAppError('DATE_BLOCKED', blocked.reason || undefined);

    return this.repo.create({
      startTime,
      endTime,
      status: AppointmentStatus.PENDING,
      channel: dto.channel || BookingChannel.WEB,
      notes: dto.notes?.trim() || '',
      clientId: clientId ?? null,
      clientName: dto.clientName?.trim() || '',
      clientPhone: dto.clientPhone?.trim() || '',
      companyId: dto.companyId,
      serviceId: dto.serviceId,
    });
  }

  async findByCompanyOwner(
    ownerId: number,
    status?: AppointmentStatus,
    page = 1,
    limit = 20,
  ) {
    const company = await this.repo.findCompanyByOwner(ownerId);
    if (!company) throwAppError('COMPANY_NOT_FOUND');

    const skip = (page - 1) * limit;
    const { data, total } = await this.repo.findManyByCompany(
      company.id,
      status,
      skip,
      limit,
    );

    return paginate(data, total, page, limit);
  }

  async findByClient(clientId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const { data, total } = await this.repo.findManyByClient(clientId, skip, limit);
    return paginate(data, total, page, limit);
  }

  async findOne(id: number) {
    const appt = await this.repo.findById(id);
    if (!appt) throwAppError('APPOINTMENT_NOT_FOUND');
    return appt;
  }

  async update(ownerId: number, appointmentId: number, dto: UpdateAppointmentDto) {
    const company = await this.repo.findCompanyByOwner(ownerId);
    if (!company) throwAppError('COMPANY_NOT_FOUND');

    const appt = await this.repo.findByIdAndCompany(appointmentId, company.id);
    if (!appt) throwAppError('APPOINTMENT_NOT_FOUND');

    return this.repo.update(appointmentId, {
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.notes !== undefined && { notes: dto.notes.trim() }),
    });
  }

  async cancelByClient(clientId: number, appointmentId: number) {
    const appt = await this.repo.findByIdAndClient(appointmentId, clientId);
    if (!appt) throwAppError('APPOINTMENT_NOT_FOUND');

    if (appt.status === AppointmentStatus.CANCELLED) {
      throwAppError('APPOINTMENT_ALREADY_CANCELLED');
    }

    return this.repo.update(appointmentId, { status: AppointmentStatus.CANCELLED });
  }
}

// Converte um Date para string "HH:MM" em UTC.
// Extraído como função pura para deixar o método create legível.
function toTimeStr(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}
