import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FindCompanyAppointmentsDto } from './dto/find-company-appointments.dto';
import type { Request } from 'express';

@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  // ═══════════════════════════════════════════════════════════════
  //  SLOTS DISPONÍVEIS (público)
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /appointments/available-slots?companyId=1&serviceId=1&date=2026-03-15
   * Retorna array de { startTime, endTime } disponíveis.
   */
  @Get('available-slots')
  getAvailableSlots(
    @Query('companyId', ParseIntPipe) companyId: number,
    @Query('serviceId', ParseIntPipe) serviceId: number,
    @Query('date') date: string,
  ) {
    return this.appointmentService.getAvailableSlots(companyId, serviceId, date);
  }

  // ═══════════════════════════════════════════════════════════════
  //  BOOKING (cliente autenticado)
  // ═══════════════════════════════════════════════════════════════

  // ── Criar agendamento como cliente logado ─────────────────────
  @Post()
  @UseGuards(AuthGuard('jwt'))
  createAsClient(@Req() req: Request, @Body() dto: CreateAppointmentDto) {
    const user = req.user as any;
    return this.appointmentService.create(dto, user.id);
  }

  // ── Criar agendamento público (sem login — para bots WhatsApp/Telegram) ─
  @Post('public')
  createPublic(@Body() dto: CreateAppointmentDto) {
    return this.appointmentService.create(dto);
  }

  // ── Meus agendamentos (cliente) ───────────────────────────────
  @Get('my')
  @UseGuards(AuthGuard('jwt'))
  findMyAppointments(@Req() req: Request, @Query() pagination: PaginationDto) {
    const user = req.user as any;
    return this.appointmentService.findByClient(user.id, pagination.page, pagination.limit);
  }

  // ── Cancelar meu agendamento (cliente) ────────────────────────
  @Patch(':id/cancel')
  @UseGuards(AuthGuard('jwt'))
  cancelMyAppointment(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req.user as any;
    return this.appointmentService.cancelByClient(user.id, id);
  }

  // ═══════════════════════════════════════════════════════════════
  //  GERENCIAR AGENDAMENTOS (empresa)
  // ═══════════════════════════════════════════════════════════════

  // ── Listar agendamentos da minha empresa ──────────────────────
  @Get('company')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  findCompanyAppointments(
    @Req() req: Request,
    @Query() query: FindCompanyAppointmentsDto,
  ) {
    const user = req.user as any;
    return this.appointmentService.findByCompanyOwner(
      user.id,
      query.status,
      query.page,
      query.limit,
    );
  }

  // ── Atualizar agendamento (empresa — mudar status, notas) ─────
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  updateAppointment(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentDto,
  ) {
    const user = req.user as any;
    return this.appointmentService.update(user.id, id, dto);
  }

  // ── Buscar agendamento por ID ─────────────────────────────────
  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentService.findOne(id);
  }
}
