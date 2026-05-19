# NotesApp API

<p align="center">
  <strong>REST API para plataforma de agendamentos e gestão de serviços</strong>
</p>

<div align="center">

[![NestJS](https://img.shields.io/badge/NestJS-11.0-red?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-orange?logo=mysql&logoColor=white)](https://www.mysql.com)
[![Prisma](https://img.shields.io/badge/Prisma-7.4-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![License](https://img.shields.io/badge/License-UNLICENSED-red)](#)

</div>

---

## 📋 Visão Geral

**NotesApp API** é a camada backend de uma plataforma SaaS de agendamentos online. Permite que empresas gerenciem serviços, horários e agendamentos, enquanto clientes podem consultar disponibilidade e realizar reservas via web ou Telegram.

**Status**: Em desenvolvimento  
**Porta**: 8088

---

## ✨ Funcionalidades Principais

- **🔐 Autenticação & Autorização**: JWT + Refresh Tokens com suporte a múltiplos roles (USER, COMPANY, ADMIN, MODERATOR)
- **🏢 Gestão de Empresas**: Cadastro de negócios com descrição, contato e localização
- **🛠️ Serviços**: CRUD completo com duração, preço e status ativo/inativo
- **📅 Agendamento Flexível**: Horários semanais, bloqueio de datas (férias/feriados) e geração dinâmica de slots
- **📞 Agendamentos**: Sistema robusto com múltiplos canais (Web, WhatsApp, Telegram) e status (Pendente, Confirmado, Cancelado, Concluído, Não compareceu)
- **🤖 Bot Telegram**: Integração com Telegraf para booking conversacional
- **📊 Motor de Disponibilidade**: Cálculo inteligente de slots disponíveis levando em conta serviços, duração e agendamentos existentes

---

## 🛠️ Stack Técnico

| Camada | Tecnologia |
|--------|-----------|
| **Framework** | NestJS 11 (TypeScript) |
| **Banco de Dados** | MySQL 8.0 |
| **ORM** | Prisma 7.4 |
| **Autenticação** | JWT + Passport |
| **Validação** | class-validator, class-transformer |
| **Bot** | Telegraf 4.16 |
| **Container** | Docker Compose |

---

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Docker & Docker Compose (para MySQL)

### Instalação

```bash
# Clonar repositório
git clone https://github.com/seu-usuario/notesapp-api.git
cd notesapp-api

# Instalar dependências
npm install
```

### Configuração

Criar arquivo `.env` na raiz:

```env
# Banco de dados
DATABASE_URL="mysql://notesapp:notesapp@localhost:3306/notesapp"

# Autenticação
COOKIE_SECRET="sua-chave-secreta-aqui"
JWT_SECRET="sua-jwt-secret-aqui"
JWT_EXPIRATION=15m

# Frontend
FRONTEND_URLS="http://localhost:3000"

# Telegram (opcional)
TELEGRAM_BOT_TOKEN="seu-token-aqui"

# Server
PORT=8088
NODE_ENV=development
```

### Iniciar Desenvolvimento

```bash
# Iniciar containers (MySQL + Adminer)
npm run mydb

# Executar migrations
npm run db:migrate

# Seed de dados de teste
npm run db:seed

# Iniciar servidor com hot reload
npm run dev
```

O servidor estará em: **http://localhost:8088**

Adminer (gerenciar DB): **http://localhost:8080**

---

## 📚 Comandos Disponíveis

```bash
# Desenvolvimento
npm run dev              # Servidor com hot reload
npm run build            # Build para produção
npm run start:prod       # Rodar build em produção

# Banco de Dados
npm run mydb             # docker compose up -d (MySQL + Adminer)
npm run db:migrate       # Criar/aplicar migrations
npm run db:push          # Sincronizar schema sem migration file
npm run db:generate      # Regenerar Prisma Client
npm run db:studio        # Abrir Prisma Studio (interface visual)
npm run db:seed          # Seed com dados de teste

# Testes
npm run test             # Jest - testes unitários
npm run test:watch       # Jest em modo watch
npm run test:e2e         # Testes E2E
npm run test:cov         # Cobertura de testes

# Qualidade de Código
npm run lint             # ESLint com fix automático
npm run format           # Prettier formatting
```

---

## 📁 Estrutura de Módulos

```
src/
├── auth/                # Autenticação (JWT, Passport, Login/Register)
├── company/             # Gestão de empresas e perfis
├── service/             # Serviços oferecidos (CRUD)
├── schedule/            # Horários semanais e datas bloqueadas
├── appointment/         # Agendamentos, slots e motor de disponibilidade
├── telegram/            # Bot do Telegram (Telegraf)
├── common/              # Utilitários compartilhados, filtros, interceptadores
├── prisma/              # PrismaService (singleton)
└── main.ts              # Entry point
```

### Convenções

- **Controller**: HTTP apenas (recebe, valida, responde)
- **Service**: Orquestração e casos de uso
- **Repository**: Prisma apenas, sem lógica de negócio
- **Domain**: Regras puras (sem framework, sem DB)

---

## 🔗 Endpoints Principais

### Autenticação
- `POST /auth/register` — Registrar novo usuário
- `POST /auth/login` — Login (retorna JWT + cookie refresh)
- `POST /auth/refresh` — Renovar access token
- `POST /auth/logout` — Logout

### Empresa
- `GET /company/:id` — Detalhes da empresa
- `POST /company` — Criar empresa (Roles: COMPANY)
- `PATCH /company/:id` — Atualizar empresa

### Serviços
- `GET /service/company/:companyId` — Listar serviços da empresa
- `POST /service` — Criar serviço
- `PATCH /service/:id` — Atualizar serviço
- `DELETE /service/:id` — Deletar serviço

### Agendamentos
- `GET /appointment/available-slots` — Consultar slots disponíveis
- `GET /appointment` — Listar agendamentos (filtrado por role)
- `POST /appointment` — Criar agendamento
- `PATCH /appointment/:id/cancel` — Cancelar agendamento

### Horários & Bloqueios
- `GET /schedule/company/:companyId` — Horários da semana
- `POST /schedule` — Adicionar horário
- `POST /schedule/block-date` — Bloquear data

---

## 🔒 Autenticação & Autorização

### Fluxo JWT

1. Login → API gera **access token** (JWT curto) + **refresh token** (cookie httpOnly)
2. Cliente envia `Authorization: Bearer {accessToken}`
3. Token expira → Cliente chama `/auth/refresh` → Nova sessão
4. Logout → Token invalidado

### Roles & Guards

```typescript
@Roles('COMPANY', 'ADMIN')
@UseGuards(JwtAuthGuard, RolesGuard)
@Patch('/company/:id')
updateCompany(@Param('id') id: string) { ... }
```

Disponível: `USER`, `COMPANY`, `ADMIN`, `MODERATOR`

---

## 📊 Resposta Padrão

Todas as respostas seguem este envelope:

```json
{
  "statusCode": 200,
  "data": { ... },
  "path": "/endpoint",
  "timestamp": "2026-05-18T10:30:00Z"
}
```

**Erro:**

```json
{
  "statusCode": 400,
  "errorCode": "INVALID_INPUT",
  "message": "Descrição do erro",
  "details": { ... },
  "path": "/endpoint",
  "timestamp": "2026-05-18T10:30:00Z"
}
```

---

## 📦 Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `DATABASE_URL` | String de conexão MySQL | `mysql://notesapp:notesapp@localhost:3306/notesapp` |
| `JWT_SECRET` | Chave para assinar JWTs | *Obrigatório* |
| `COOKIE_SECRET` | Chave para assinar cookies | *Obrigatório* |
| `JWT_EXPIRATION` | Tempo de vida do token | `15m` |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram | Opcional (bot desativa se não fornecido) |
| `FRONTEND_URLS` | URLs permitidas do frontend (CSV) | `http://localhost:3000` |
| `PORT` | Porta do servidor | `8088` |
| `NODE_ENV` | Ambiente | `development` |

---

## 🗄️ Banco de Dados

### Modelos Principais

- **User**: Usuários do sistema (roles: USER, COMPANY, ADMIN, MODERATOR)
- **Company**: Perfil público de negócio (1 owner = 1 company)
- **Service**: Serviços oferecidos (duração em minutos, preço em centavos)
- **WeeklySchedule**: Horários por dia da semana (0=Dom até 6=Sab)
- **BlockedDate**: Datas bloqueadas (férias, feriados)
- **Appointment**: Agendamentos com status e canal de origem
- **RefreshToken**: Armazenamento de refresh tokens (1 por login)

### Schema

Visualizar ou modificar:

```bash
npm run db:studio       # Interface visual no navegador
```

---

## 🤖 Bot Telegram

O bot usa **Telegraf** com máquina de estados em memória para guiar o usuário:

1. Usuário inicia conversa → Bot apresenta empresas
2. Seleciona empresa → Mostra serviços
3. Seleciona serviço → Exibe datas/horários disponíveis
4. Confirma slot → Agendamento criado com `channel=TELEGRAM`

Status: Ativo (desativa gracefully se `TELEGRAM_BOT_TOKEN` não for fornecido)

---

## 🧪 Testes

```bash
# Unitários
npm run test

# Com cobertura
npm run test:cov

# E2E
npm run test:e2e
```

---

## 🚀 Deploy

### Produção com Docker

```dockerfile
# Dockerfile (exemplo)
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
ENV NODE_ENV=production
EXPOSE 8088
CMD ["node", "dist/main.js"]
```

Build e push:

```bash
npm run build
docker build -t notesapp-api:latest .
docker push seu-registry/notesapp-api:latest
```

---

## 📖 Documentação

- [NestJS Docs](https://docs.nestjs.com)
- [Prisma Docs](https://www.prisma.io/docs)
- [Telegraf Docs](https://telegraf.js.org)

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📝 Licença

Unlicensed — Este projeto é proprietário.

---

**Desenvolvido com ❤️ usando NestJS + Prisma**
