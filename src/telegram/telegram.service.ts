import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { CompanyService } from '../company/company.service';
import { ServiceService } from '../service/service.service';
import { AppointmentService } from '../appointment/appointment.service';
import { BookingChannel } from '@prisma/client';

// ── Estado do wizard por chat ────────────────────────────────────
interface WizardState {
  step:
    | 'choose_service'
    | 'choose_date'
    | 'choose_slot'
    | 'enter_name'
    | 'enter_phone'
    | 'confirm';
  companyId: number;
  companyName: string;
  serviceId?: number;
  serviceName?: string;
  serviceDuration?: number;
  servicePrice?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  clientName?: string;
  clientPhone?: string;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  /** Armazena estado do wizard por chatId */
  private sessions = new Map<number, WizardState>();

  constructor(
    private readonly companyService: CompanyService,
    private readonly serviceService: ServiceService,
    private readonly appointmentService: AppointmentService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN não configurado — bot desativado. ' +
          'Defina a variável de ambiente para ativar o bot.',
      );
      return;
    }

    this.bot = new Telegraf(token);
    this.registerHandlers();

    // Inicia em modo polling (ideal para dev/MVP; em produção usar webhook)
    this.bot
      .launch()
      .then(() => this.logger.log('🤖 Telegram bot iniciado com sucesso'))
      .catch((err) => this.logger.error('Falha ao iniciar bot Telegram', err));
  }

  onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('App shutdown');
      this.logger.log('Telegram bot parado');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  private getChatId(ctx: any): number {
    return ctx.chat?.id ?? 0;
  }

  private formatPrice(centavos: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(centavos / 100);
  }

  /** Escapa caracteres especiais do MarkdownV2 do Telegram */
  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }

  // ═══════════════════════════════════════════════════════════════
  //  HANDLERS
  // ═══════════════════════════════════════════════════════════════

  private registerHandlers() {
    if (!this.bot) return;

    // ── /start ──────────────────────────────────────────────────
    this.bot.start((ctx) => {
      const startPayload = (ctx as any).startPayload as string | undefined;
      if (startPayload) {
        // Deep link: t.me/bot?start=slug
        return this.handleAgendar(ctx, startPayload);
      }
      return ctx.reply(
        '👋 Olá! Eu sou o bot de agendamentos.\n\n' +
          'Para agendar, envie:\n' +
          '/agendar <slug-da-empresa>\n\n' +
          'Exemplo: /agendar barbearia-do-joao\n\n' +
          'Você também pode acessar diretamente pelo link que a empresa compartilhar.',
      );
    });

    // ── /agendar <slug> ─────────────────────────────────────────
    this.bot.command('agendar', (ctx) => {
      const slug = ctx.message.text.split(/\s+/)[1];
      if (!slug) {
        return ctx.reply(
          '⚠️ Informe o slug da empresa.\n' +
            'Exemplo: /agendar barbearia-do-joao',
        );
      }
      return this.handleAgendar(ctx, slug);
    });

    // ── /cancelar ───────────────────────────────────────────────
    this.bot.command('cancelar', (ctx) => {
      this.sessions.delete(this.getChatId(ctx));
      return ctx.reply(
        '❌ Agendamento cancelado. Envie /agendar para recomeçar.',
      );
    });

    // ── Callback queries (inline keyboard buttons) ──────────────
    this.bot.on('callback_query', async (ctx) => {
      const data = (ctx.callbackQuery as any).data as string | undefined;
      if (!data) return;

      await ctx.answerCbQuery();

      if (data.startsWith('svc_')) {
        return this.handleServiceChoice(ctx, parseInt(data.slice(4), 10));
      }
      if (data.startsWith('date_')) {
        return this.handleDateChoice(ctx, data.slice(5));
      }
      if (data.startsWith('slot_')) {
        return this.handleSlotChoice(ctx, data.slice(5));
      }
      if (data === 'confirm_yes') {
        return this.handleConfirm(ctx);
      }
      if (data === 'confirm_no') {
        this.sessions.delete(this.getChatId(ctx));
        return ctx.editMessageText(
          '❌ Agendamento cancelado. Envie /agendar para recomeçar.',
        );
      }
    });

    // ── Mensagens de texto (wizard steps que pedem input) ────────
    this.bot.on('text', (ctx) => {
      const session = this.sessions.get(this.getChatId(ctx));
      if (!session) return; // Sem sessão ativa, ignora

      if (session.step === 'enter_name') {
        return this.handleNameInput(ctx, ctx.message.text);
      }
      if (session.step === 'enter_phone') {
        return this.handlePhoneInput(ctx, ctx.message.text);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  WIZARD STEPS
  // ═══════════════════════════════════════════════════════════════

  /** Step 1: Busca empresa e mostra serviços */
  private async handleAgendar(ctx: any, slug: string) {
    try {
      const company = await this.companyService.findBySlug(
        slug.toLowerCase().trim(),
      );

      if (!company.services || company.services.length === 0) {
        return ctx.reply(
          `😕 A empresa "${company.name}" não possui serviços disponíveis no momento.`,
        );
      }

      // Inicia sessão
      const chatId = this.getChatId(ctx);
      this.sessions.set(chatId, {
        step: 'choose_service',
        companyId: company.id,
        companyName: company.name,
      });

      const keyboard = company.services.map((s: any) => [
        {
          text: `${s.name} · ${s.duration}min · ${this.formatPrice(s.price as number)}`,
          callback_data: `svc_${s.id}`,
        },
      ]);

      return ctx.reply(
        `🏢 *${this.escapeMarkdown(company.name)}*\n\nEscolha o serviço:`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: keyboard },
        },
      );
    } catch {
      this.logger.warn(`Empresa não encontrada: ${slug}`);
      return ctx.reply(
        `😕 Empresa "${slug}" não encontrada.\n\n` +
          'Verifique o slug e tente novamente.\n' +
          'Exemplo: /agendar barbearia-do-joao',
      );
    }
  }

  /** Step 2: Serviço escolhido → mostra próximos 7 dias */
  private async handleServiceChoice(ctx: any, serviceId: number) {
    const chatId = this.getChatId(ctx);
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'choose_service') {
      return ctx.editMessageText(
        '⚠️ Sessão expirada. Envie /agendar para recomeçar.',
      );
    }

    const services = await this.serviceService.findActiveByCompanyId(
      session.companyId,
    );
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      return ctx.editMessageText(
        '⚠️ Serviço não encontrado. Envie /agendar para recomeçar.',
      );
    }

    session.serviceId = service.id;
    session.serviceName = service.name;
    session.serviceDuration = service.duration;
    session.servicePrice = service.price;
    session.step = 'choose_date';

    // Gera próximos 7 dias
    const today = new Date();
    const dates: { text: string; callback_data: string }[][] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      });
      dates.push([{ text: label, callback_data: `date_${dateStr}` }]);
    }

    return ctx.editMessageText(
      `✅ *${this.escapeMarkdown(service.name)}*\n` +
        `⏱ ${service.duration}min · 💰 ${this.escapeMarkdown(this.formatPrice(service.price))}\n\n` +
        `Escolha a data:`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: dates },
      },
    );
  }

  /** Step 3: Data escolhida → mostra horários disponíveis */
  private async handleDateChoice(ctx: any, dateStr: string) {
    const chatId = this.getChatId(ctx);
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'choose_date') {
      return ctx.editMessageText(
        '⚠️ Sessão expirada. Envie /agendar para recomeçar.',
      );
    }

    session.date = dateStr;

    try {
      const slots = await this.appointmentService.getAvailableSlots(
        session.companyId,
        session.serviceId!,
        dateStr,
      );

      if (slots.length === 0) {
        session.step = 'choose_date';
        return ctx.editMessageText(
          '😕 Nenhum horário disponível nesta data\\.\n\nEscolha outra data ou envie /cancelar\\.',
          { parse_mode: 'MarkdownV2' },
        );
      }

      session.step = 'choose_slot';

      // Agrupa em linhas de 3 botões
      const keyboard: { text: string; callback_data: string }[][] = [];
      let row: { text: string; callback_data: string }[] = [];

      for (const slot of slots) {
        const time = new Date(slot.startTime).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });
        row.push({ text: time, callback_data: `slot_${slot.startTime}` });
        if (row.length === 3) {
          keyboard.push(row);
          row = [];
        }
      }
      if (row.length > 0) keyboard.push(row);

      const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString(
        'pt-BR',
        {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        },
      );

      return ctx.editMessageText(
        `📅 *${this.escapeMarkdown(dateLabel)}*\n\nEscolha o horário:`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: keyboard },
        },
      );
    } catch (err) {
      this.logger.error('Erro ao buscar slots', err);
      return ctx.editMessageText(
        '❌ Erro ao buscar horários. Tente novamente com /agendar.',
      );
    }
  }

  /** Step 4: Horário escolhido → pede nome */
  private handleSlotChoice(ctx: any, startTimeISO: string) {
    const chatId = this.getChatId(ctx);
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'choose_slot') {
      return ctx.editMessageText(
        '⚠️ Sessão expirada. Envie /agendar para recomeçar.',
      );
    }

    session.startTime = startTimeISO;
    session.endTime = new Date(
      new Date(startTimeISO).getTime() + session.serviceDuration! * 60 * 1000,
    ).toISOString();
    session.step = 'enter_name';

    const time = new Date(startTimeISO).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    return ctx.editMessageText(
      `🕐 Horário selecionado: *${this.escapeMarkdown(time)}*\n\n` +
        'Agora, digite seu *nome completo*:',
      { parse_mode: 'MarkdownV2' },
    );
  }

  /** Step 5: Nome informado → pede telefone */
  private handleNameInput(ctx: any, name: string) {
    const chatId = this.getChatId(ctx);
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'enter_name') return;

    if (name.trim().length < 2) {
      return ctx.reply('⚠️ Nome muito curto. Digite seu nome completo:');
    }

    session.clientName = name.trim();
    session.step = 'enter_phone';

    return ctx.reply(
      '📱 Agora, digite seu *telefone* \\(com DDD\\):\n\nExemplo: 11999998888',
      { parse_mode: 'MarkdownV2' },
    );
  }

  /** Step 6: Telefone informado → mostra resumo para confirmação */
  private handlePhoneInput(ctx: any, phone: string) {
    const chatId = this.getChatId(ctx);
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'enter_phone') return;

    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 11) {
      return ctx.reply(
        '⚠️ Telefone inválido. Digite com DDD (10 ou 11 dígitos):\nExemplo: 11999998888',
      );
    }

    session.clientPhone = cleaned;
    session.step = 'confirm';

    const dateLabel = new Date(session.date + 'T12:00:00').toLocaleDateString(
      'pt-BR',
      {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      },
    );
    const time = new Date(session.startTime!).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const summary =
      `📋 *Resumo do agendamento*\n\n` +
      `🏢 ${this.escapeMarkdown(session.companyName)}\n` +
      `💇 ${this.escapeMarkdown(session.serviceName!)}\n` +
      `📅 ${this.escapeMarkdown(dateLabel)}\n` +
      `🕐 ${this.escapeMarkdown(time)}\n` +
      `💰 ${this.escapeMarkdown(this.formatPrice(session.servicePrice!))}\n` +
      `👤 ${this.escapeMarkdown(session.clientName!)}\n` +
      `📱 ${this.escapeMarkdown(session.clientPhone!)}\n\n` +
      `*Confirmar agendamento?*`;

    return ctx.reply(summary, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirmar', callback_data: 'confirm_yes' },
            { text: '❌ Cancelar', callback_data: 'confirm_no' },
          ],
        ],
      },
    });
  }

  /** Step 7: Confirmação → cria agendamento */
  private async handleConfirm(ctx: any) {
    const chatId = this.getChatId(ctx);
    const session = this.sessions.get(chatId);
    if (!session || session.step !== 'confirm') {
      return ctx.editMessageText(
        '⚠️ Sessão expirada. Envie /agendar para recomeçar.',
      );
    }

    try {
      const appointment = await this.appointmentService.create({
        companyId: session.companyId,
        serviceId: session.serviceId!,
        startTime: session.startTime!,
        clientName: session.clientName,
        clientPhone: session.clientPhone,
        channel: BookingChannel.TELEGRAM,
      });

      this.sessions.delete(chatId);

      const time = new Date(appointment.startTime).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      const dateLabel = new Date(appointment.startTime).toLocaleDateString(
        'pt-BR',
        {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        },
      );

      return ctx.editMessageText(
        `✅ *Agendamento confirmado\\!*\n\n` +
          `🏢 ${this.escapeMarkdown(session.companyName)}\n` +
          `💇 ${this.escapeMarkdown(session.serviceName!)}\n` +
          `📅 ${this.escapeMarkdown(dateLabel)} às ${this.escapeMarkdown(time)}\n\n` +
          `Seu código: *#${appointment.id}*\n\n` +
          `Obrigado, ${this.escapeMarkdown(session.clientName!)}\\! Até logo\\. 👋`,
        { parse_mode: 'MarkdownV2' },
      );
    } catch (err: any) {
      this.logger.error('Erro ao criar agendamento via Telegram', err);

      const message =
        err?.response?.message || err?.message || 'Erro desconhecido';
      this.sessions.delete(chatId);

      return ctx.editMessageText(
        `❌ Não foi possível confirmar o agendamento.\n\n` +
          `Motivo: ${message}\n\n` +
          `Envie /agendar para tentar novamente.`,
      );
    }
  }
}
