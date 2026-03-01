import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { throwAppError } from '../common/errors/error-catalog';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  // ── Criar empresa (vinculada ao user logado) ──────────────────
  async create(ownerId: number, dto: CreateCompanyDto) {
    // Verificar se o user já tem empresa
    const existing = await this.prisma.company.findUnique({
      where: { ownerId },
    });
    if (existing) throwAppError('CONFLICT', 'Você já possui uma empresa cadastrada');

    // Verificar slug único
    const slugTaken = await this.prisma.company.findUnique({
      where: { slug: dto.slug },
    });
    if (slugTaken) throwAppError('CONFLICT', 'Este slug já está em uso');

    const company = await this.prisma.company.create({
      data: {
        name: dto.name.trim(),
        slug: dto.slug.toLowerCase().trim(),
        description: dto.description?.trim() || '',
        phone: dto.phone?.trim() || '',
        address: dto.address?.trim() || '',
        timezone: dto.timezone?.trim() || 'America/Sao_Paulo',
        ownerId,
      },
    });

    return company;
  }

  // ── Buscar empresa do user logado ─────────────────────────────
  async findByOwner(ownerId: number) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId },
      include: { services: true, schedules: true },
    });
    if (!company) throwAppError('USER_NOT_FOUND', 'Empresa não encontrada');
    return company;
  }

  // ── Buscar empresa por slug (público — para página de booking) ─
  async findBySlug(slug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug },
      include: {
        services: { where: { active: true } },
        schedules: { where: { enabled: true } },
      },
    });
    if (!company) throwAppError('USER_NOT_FOUND', 'Empresa não encontrada');
    return company;
  }

  // ── Atualizar empresa ─────────────────────────────────────────
  async update(ownerId: number, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId },
    });
    if (!company) throwAppError('USER_NOT_FOUND', 'Empresa não encontrada');

    // Se está mudando o slug, verificar unicidade
    if (dto.slug && dto.slug !== company.slug) {
      const slugTaken = await this.prisma.company.findUnique({
        where: { slug: dto.slug },
      });
      if (slugTaken) throwAppError('CONFLICT', 'Este slug já está em uso');
    }

    return this.prisma.company.update({
      where: { id: company.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.slug !== undefined && { slug: dto.slug.toLowerCase().trim() }),
        ...(dto.description !== undefined && { description: dto.description.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
        ...(dto.address !== undefined && { address: dto.address.trim() }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone.trim() }),
      },
    });
  }

  // ── Listar todas as empresas (admin) ──────────────────────────
  async findAll() {
    return this.prisma.company.findMany({
      include: { owner: { omit: { password: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
