import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { throwAppError } from '../common/errors/error-catalog';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServiceService {
  constructor(private prisma: PrismaService) {}

  // ── Helper: busca a company do owner logado ───────────────────
  private async getCompanyByOwner(ownerId: number) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId },
    });
    if (!company) throwAppError('USER_NOT_FOUND', 'Empresa não encontrada. Crie sua empresa primeiro.');
    return company;
  }

  // ── Criar serviço ─────────────────────────────────────────────
  async create(ownerId: number, dto: CreateServiceDto) {
    const company = await this.getCompanyByOwner(ownerId);

    return this.prisma.service.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || '',
        duration: dto.duration,
        price: dto.price ?? 0,
        companyId: company.id,
      },
    });
  }

  // ── Listar serviços da minha empresa ──────────────────────────
  async findAllByOwner(ownerId: number) {
    const company = await this.getCompanyByOwner(ownerId);

    return this.prisma.service.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Buscar serviço por ID (verificando ownership) ─────────────
  async findOne(ownerId: number, serviceId: number) {
    const company = await this.getCompanyByOwner(ownerId);

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, companyId: company.id },
    });
    if (!service) throwAppError('USER_NOT_FOUND', 'Serviço não encontrado');
    return service;
  }

  // ── Atualizar serviço ─────────────────────────────────────────
  async update(ownerId: number, serviceId: number, dto: UpdateServiceDto) {
    const company = await this.getCompanyByOwner(ownerId);

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, companyId: company.id },
    });
    if (!service) throwAppError('USER_NOT_FOUND', 'Serviço não encontrado');

    return this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description.trim() }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
  }

  // ── Deletar serviço ───────────────────────────────────────────
  async remove(ownerId: number, serviceId: number) {
    const company = await this.getCompanyByOwner(ownerId);

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, companyId: company.id },
    });
    if (!service) throwAppError('USER_NOT_FOUND', 'Serviço não encontrado');

    await this.prisma.service.delete({ where: { id: serviceId } });
    return { ok: true };
  }

  // ── Listar serviços ativos de uma empresa (público) ───────────
  async findActiveByCompanyId(companyId: number) {
    return this.prisma.service.findMany({
      where: { companyId, active: true },
      orderBy: { name: 'asc' },
    });
  }
}
