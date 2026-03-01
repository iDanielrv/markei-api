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
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { Request } from 'express';

@Controller('services')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  // ── Criar serviço ─────────────────────────────────────────────
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  create(@Req() req: Request, @Body() dto: CreateServiceDto) {
    const user = req.user as any;
    return this.serviceService.create(user.id, dto);
  }

  // ── Listar meus serviços ──────────────────────────────────────
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  findAll(@Req() req: Request) {
    const user = req.user as any;
    return this.serviceService.findAllByOwner(user.id);
  }

  // ── Buscar serviço por ID ─────────────────────────────────────
  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  findOne(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as any;
    return this.serviceService.findOne(user.id, id);
  }

  // ── Atualizar serviço ─────────────────────────────────────────
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
  ) {
    const user = req.user as any;
    return this.serviceService.update(user.id, id, dto);
  }

  // ── Deletar serviço ───────────────────────────────────────────
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as any;
    return this.serviceService.remove(user.id, id);
  }
}
