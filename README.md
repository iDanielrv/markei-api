# Markei API

> REST API da plataforma **Markei** — agendamentos multi-canal para negócios de serviços.

Construído com **NestJS**, **Prisma** e **MySQL**. Gerencia autenticação, perfis de empresa, serviços, grades horárias semanais e reservas com cálculo de slots disponíveis em tempo real.

---

## Funcionalidades

- **Autenticação JWT** — access token de curta duração + refresh token em cookie httpOnly com rotação automática
- **Controle de acesso por papéis** — `USER`, `COMPANY`, `ADMIN`, `MODERATOR`
- **Gestão de empresas** — perfil com slug público usado na página de agendamento
- **Catálogo de serviços** — nome, duração (minutos) e preço (centavos) por empresa
- **Grade horária semanal** — ativar/desativar dias e definir horário de início/fim; bloquear datas específicas (feriados, férias)
- **Motor de disponibilidade** — gera slots de horários disponíveis filtrados por agendamentos existentes e datas bloqueadas
- **Agendamento multi-canal** — `WEB`, `TELEGRAM`, `MANUAL` (hook WhatsApp preparado)
- **Bot Telegram** — wizard em memória por sessão para clientes agendarem direto pelo Telegram
- **Envelope de resposta padronizado** — toda resposta tem `statusCode`, `data`, `path`, `timestamp`
- **Catálogo de erros centralizado** — códigos de erro tipados em toda a API

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | NestJS 11 |
| Linguagem | TypeScript |
| ORM | Prisma 7 (adaptador MariaDB) |
| Banco de dados | MySQL 8.0 (Docker) |
| Auth | `passport-jwt`, `bcryptjs`, cookies httpOnly |
| Bot | Telegraf |
| Validação | `class-validator`, `class-transformer` |
| Testes | Jest |

---

## Como rodar

### Pré-requisitos

- Node.js 20+
- Docker (para o MySQL)

### Instalação

```bash
git clone <repo-url>
cd markei-api
npm install
```

### Variáveis de ambiente

```bash
cp .env.example .env
```

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | String de conexão MySQL |
| `JWT_SECRET` | sim | Chave de assinatura JWT |
| `COOKIE_SECRET` | sim | Chave de assinatura de cookie |
| `FRONTEND_URLS` | sim | Origins permitidas para CORS (separadas por vírgula) |
| `PORT` | não | Porta da API (padrão: `8088`) |
| `TELEGRAM_BOT_TOKEN` | não | Token do bot Telegraf; bot fica desabilitado se ausente |

### Banco de dados

```bash
npm run mydb        # inicia MySQL + Adminer via Docker
npm run db:migrate  # roda as migrations do Prisma
npm run db:seed     # popula dados de teste (owner: barbearia_teste / teste123)
```

Adminer disponível em `http://localhost:8080`.

### Rodando

```bash
npm run dev                              # desenvolvimento com hot reload
npm run build && npm run start:prod      # produção
```

---

## Endpoints

Todas as respostas seguem o envelope:

```json
{
  "statusCode": 200,
  "data": {},
  "path": "/auth/login",
  "timestamp": "2026-05-18T00:00:00.000Z"
}
```

### Auth — `/auth`

| Método | Path | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/register` | Público | Criar conta |
| POST | `/auth/login` | Público | Login — retorna access token e seta cookie |
| POST | `/auth/logout` | JWT | Revogar refresh token |
| POST | `/auth/refresh` | Cookie | Emitir novo access token |
| GET | `/auth/profile` | JWT | Usuário atual |
| GET | `/auth/admin/users` | ADMIN | Listar todos os usuários |
| POST | `/auth/admin/users` | ADMIN | Criar usuário com papel específico |

### Empresas — `/companies`

| Método | Path | Auth | Descrição |
|---|---|---|---|
| POST | `/companies` | COMPANY | Criar perfil de empresa |
| GET | `/companies/me` | COMPANY | Própria empresa |
| PATCH | `/companies/me` | COMPANY | Atualizar perfil |
| GET | `/companies/slug/:slug` | Público | Busca pública por slug |
| GET | `/companies` | ADMIN | Listar todas as empresas |

### Serviços — `/services`

| Método | Path | Auth | Descrição |
|---|---|---|---|
| POST | `/services` | COMPANY | Adicionar serviço |
| GET | `/services` | COMPANY | Listar serviços da empresa |
| PATCH | `/services/:id` | COMPANY | Atualizar serviço |
| DELETE | `/services/:id` | COMPANY | Remover serviço |

### Horários — `/schedules`

| Método | Path | Auth | Descrição |
|---|---|---|---|
| POST | `/schedules/bulk` | COMPANY | Definir grade horária semanal |
| GET | `/schedules` | COMPANY | Ver grade atual |
| PATCH | `/schedules/:id` | COMPANY | Atualizar um slot |
| POST | `/schedules/blocked-dates` | COMPANY | Bloquear uma data |

### Agendamentos — `/appointments`

| Método | Path | Auth | Descrição |
|---|---|---|---|
| GET | `/appointments/available-slots` | Público | Slots disponíveis para um serviço em uma data |
| POST | `/appointments/public` | Público | Agendar sem login (clientName + clientPhone) |
| POST | `/appointments` | JWT | Agendar como usuário logado |
| GET | `/appointments/my` | JWT | Agendamentos do cliente |
| GET | `/appointments/company` | COMPANY | Todos os agendamentos da empresa |
| PATCH | `/appointments/:id` | COMPANY | Atualizar status / detalhes |
| PATCH | `/appointments/:id/cancel` | JWT | Cancelar agendamento |

---

## Arquitetura

```
src/
  auth/           # estratégia JWT, guards, rotação de tokens
  company/        # CRUD de empresa + resolução de slug
  service/        # catálogo de serviços
  schedule/       # WeeklySchedule + BlockedDate
  appointment/    # motor de slots + CRUD de agendamentos
  telegram/       # bot Telegraf (wizard por etapas)
  prisma/         # PrismaService singleton
  common/
    errors/       # ErrorCatalog + throwAppError()
    decorators/   # @CurrentUser, @Roles
    guards/       # RolesGuard
    filters/      # HttpExceptionFilter
    interceptors/ # ResponseTransformInterceptor
    helpers/      # requireEnv, paginate
```

Cada módulo segue o padrão:

```
<módulo>.controller.ts  — só HTTP (receber, validar, responder)
<módulo>.service.ts     — orquestração / casos de uso
<módulo>.repository.ts  — só queries Prisma, sem regra de negócio
```

---

## Schema do banco

```
User ──< RefreshToken
User ──< Appointment (como cliente)
User ──  Company
Company ──< Service
Company ──< WeeklySchedule
Company ──< BlockedDate
Company ──< Appointment
Service ──< Appointment
```

**Status de agendamento:** `PENDING` → `CONFIRMED` → `COMPLETED` / `NO_SHOW` / `CANCELLED`

**Canais de booking:** `WEB` · `TELEGRAM` · `WHATSAPP` · `MANUAL`

---

## Scripts

```bash
npm run dev           # hot reload
npm run build         # compilar
npm run test          # testes unitários (Jest)
npm run test:e2e      # testes e2e
npm run lint          # ESLint --fix
npm run mydb          # docker compose up -d
npm run db:migrate    # prisma migrate dev
npm run db:push       # prisma db push
npm run db:generate   # regenerar cliente Prisma
npm run db:studio     # Prisma Studio
npm run db:seed       # popular dados de teste
```

---

## Relacionado

- **[Markei Frontend](https://github.com/iDanielrv/markei-frontend)** — cliente Next.js 16
