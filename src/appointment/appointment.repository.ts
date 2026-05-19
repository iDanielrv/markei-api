import { Injectable } from '@nestjs/common';
import { AppointmentStatus, BookingChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Tipo local para os dados de criação — evita importar o DTO aqui (o repositório
// não conhece camada HTTP, só dados puros).
export type CreateAppointmentData = {
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  channel: BookingChannel;
  notes: string;
  clientId: number | null;
  clientName: string;
  clientPhone: string;
  companyId: number;
  serviceId: number;
};

export type UpdateAppointmentData = {
  status?: AppointmentStatus;
  notes?: string;
};

@Injectable()
export class AppointmentRepository {
  constructor(private prisma: PrismaService) {}

  // ── Empresa ───────────────────────────────────────────────────
  // Estas queries de Company e Service estão aqui por conveniência enquanto
  // não existem CompanyRepository e ServiceRepository. Quando criá-los,
  // mover para lá e injetar no AppointmentService.

  findCompanyByOwner(ownerId: number) {
    return this.prisma.company.findUnique({ where: { ownerId } });
  }

  // ── Serviço ───────────────────────────────────────────────────

  findActiveService(serviceId: number, companyId: number) {
    return this.prisma.service.findFirst({
      where: { id: serviceId, companyId, active: true },
    });
  }

  // ── Horários semanais ─────────────────────────────────────────

  findSchedulesByDay(companyId: number, dayOfWeek: number) {
    return this.prisma.weeklySchedule.findMany({
      where: { companyId, dayOfWeek, enabled: true },
      orderBy: { startTime: 'asc' },
    });
  }

  // Verifica se um slot está dentro de algum expediente da empresa.
  // startTimeStr e endTimeStr são strings no formato "HH:MM".
  findScheduleContainingSlot(
    companyId: number,
    dayOfWeek: number,
    startTimeStr: string,
    endTimeStr: string,
  ) {
    return this.prisma.weeklySchedule.findFirst({
      where: {
        companyId,
        dayOfWeek,
        enabled: true,
        startTime: { lte: startTimeStr },
        endTime: { gte: endTimeStr },
      },
    });
  }

  // ── Datas bloqueadas ──────────────────────────────────────────

  findBlockedDate(companyId: number, startOfDay: Date, endOfDay: Date) {
    return this.prisma.blockedDate.findFirst({
      where: {
        companyId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });
  }

  // ── Agendamentos ──────────────────────────────────────────────

  // Busca todos os agendamentos não-cancelados de um dia.
  // Usado pelo motor de slots para saber quais horários já estão ocupados.
  findAppointmentsForDay(companyId: number, startOfDay: Date, endOfDay: Date) {
    return this.prisma.appointment.findMany({
      where: {
        companyId,
        startTime: { gte: startOfDay },
        endTime: { lte: new Date(endOfDay.getTime() + 1) },
        status: { notIn: [AppointmentStatus.CANCELLED] },
      },
    });
  }

  // Busca o primeiro agendamento que colide com o intervalo dado.
  // Usado para garantir que um novo slot não está ocupado antes de criar.
  findConflictingAppointment(
    companyId: number,
    startTime: Date,
    endTime: Date,
  ) {
    return this.prisma.appointment.findFirst({
      where: {
        companyId,
        status: { notIn: [AppointmentStatus.CANCELLED] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
  }

  findById(id: number) {
    return this.prisma.appointment.findUnique({
      where: { id },
      include: {
        service: true,
        company: true,
        client: { omit: { password: true } },
      },
    });
  }

  // Busca pelo ID garantindo que pertence à empresa — evita que uma empresa
  // veja/edite agendamento de outra.
  findByIdAndCompany(id: number, companyId: number) {
    return this.prisma.appointment.findFirst({
      where: { id, companyId },
    });
  }

  // Busca pelo ID garantindo que pertence ao cliente — evita cancelamento
  // de agendamento de outro usuário.
  findByIdAndClient(id: number, clientId: number) {
    return this.prisma.appointment.findFirst({
      where: { id, clientId },
    });
  }

  async findManyByCompany(
    companyId: number,
    status: AppointmentStatus | undefined,
    skip: number,
    limit: number,
  ) {
    const where = { companyId, ...(status && { status }) };
    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: { service: true, client: { omit: { password: true } } },
        orderBy: { startTime: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return { data, total };
  }

  async findManyByClient(clientId: number, skip: number, limit: number) {
    const where = { clientId };
    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: { service: true, company: true },
        orderBy: { startTime: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return { data, total };
  }

  create(data: CreateAppointmentData) {
    return this.prisma.appointment.create({
      data,
      include: { service: true },
    });
  }

  update(id: number, data: UpdateAppointmentData) {
    return this.prisma.appointment.update({
      where: { id },
      data,
      include: { service: true },
    });
  }
}
