import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user.type';

@Controller('services')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  // ── Criar serviço ─────────────────────────────────────────────
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceDto) {
    return this.serviceService.create(user.id, dto);
  }

  // ── Listar meus serviços ──────────────────────────────────────
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  findAll(@CurrentUser() user: AuthUser) {
    return this.serviceService.findAllByOwner(user.id);
  }

  // ── Buscar serviço por ID ─────────────────────────────────────
  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.serviceService.findOne(user.id, id);
  }

  // ── Atualizar serviço ─────────────────────────────────────────
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.serviceService.update(user.id, id, dto);
  }

  // ── Deletar serviço ───────────────────────────────────────────
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.serviceService.remove(user.id, id);
  }
}
