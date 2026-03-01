import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import type { Request } from 'express';

@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  // ── Criar empresa (user com role COMPANY) ─────────────────────
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  create(@Req() req: Request, @Body() dto: CreateCompanyDto) {
    const user = req.user as any;
    return this.companyService.create(user.id, dto);
  }

  // ── Minha empresa (user logado) ───────────────────────────────
  @Get('me')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  findMine(@Req() req: Request) {
    const user = req.user as any;
    return this.companyService.findByOwner(user.id);
  }

  // ── Atualizar minha empresa ───────────────────────────────────
  @Patch('me')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  updateMine(@Req() req: Request, @Body() dto: UpdateCompanyDto) {
    const user = req.user as any;
    return this.companyService.update(user.id, dto);
  }

  // ── Buscar empresa por slug (público — booking page) ──────────
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.companyService.findBySlug(slug);
  }

  // ── Admin: listar todas ───────────────────────────────────────
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  findAll() {
    return this.companyService.findAll();
  }
}
