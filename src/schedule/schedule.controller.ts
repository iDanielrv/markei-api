import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ScheduleService } from './schedule.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { BulkScheduleDto } from './dto/bulk-schedule.dto';
import { CreateBlockedDateDto } from './dto/create-blocked-date.dto';
import type { Request } from 'express';

@Controller('schedules')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // ═══════════════════════════════════════════════════════════════
  //  WEEKLY SCHEDULE
  // ═══════════════════════════════════════════════════════════════

  // ── Criar slot individual ─────────────────────────────────────
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  createSlot(@Req() req: Request, @Body() dto: CreateScheduleDto) {
    const user = req.user as any;
    return this.scheduleService.createSlot(user.id, dto);
  }

  // ── Salvar semana inteira (bulk) ──────────────────────────────
  @Post('bulk')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  bulkSet(@Req() req: Request, @Body() dto: BulkScheduleDto) {
    const user = req.user as any;
    return this.scheduleService.bulkSetSchedule(user.id, dto.schedules);
  }

  // ── Listar meus horários ──────────────────────────────────────
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  findAll(@Req() req: Request) {
    const user = req.user as any;
    return this.scheduleService.findAllByOwner(user.id);
  }

  // ── Atualizar slot ────────────────────────────────────────────
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  updateSlot(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduleDto,
  ) {
    const user = req.user as any;
    return this.scheduleService.updateSlot(user.id, id, dto);
  }

  // ── Deletar slot ──────────────────────────────────────────────
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  removeSlot(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as any;
    return this.scheduleService.removeSlot(user.id, id);
  }

  // ═══════════════════════════════════════════════════════════════
  //  BLOCKED DATES
  // ═══════════════════════════════════════════════════════════════

  @Post('blocked-dates')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  addBlockedDate(@Req() req: Request, @Body() dto: CreateBlockedDateDto) {
    const user = req.user as any;
    return this.scheduleService.addBlockedDate(user.id, dto);
  }

  @Get('blocked-dates')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  listBlockedDates(@Req() req: Request) {
    const user = req.user as any;
    return this.scheduleService.listBlockedDates(user.id);
  }

  @Delete('blocked-dates/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  removeBlockedDate(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as any;
    return this.scheduleService.removeBlockedDate(user.id, id);
  }
}
