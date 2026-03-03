/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  AULA 3 – Testando o AuthService                                        │
 * │           jest.mock() para módulos CJS + dependências externas          │
 * │                                                                         │
 * │  Por que jest.mock() e não jest.spyOn()?                                │
 * │   • bcryptjs é um módulo CommonJS (CJS): seus exports não são           │
 * │     reconfiguráveis, então jest.spyOn() falha com:                      │
 * │       "Cannot redefine property: hash"                                  │
 * │   • jest.mock() SUBSTITUI o módulo inteiro ANTES da importação          │
 * │     (o Jest "hoist" a chamada para o topo do arquivo automaticamente)   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * CONCEITOS NOVOS NESTE ARQUIVO:
 *  - jest.mock('módulo', factory) → substitui um módulo por um fake
 *  - jest.fn() como cast → (bcrypt.hash as jest.Mock).mockResolvedValue(...)
 *  - beforeEach com jest.clearAllMocks() → limpa histórico entre testes
 *  - expect.any(String) → matcher "qualquer string" (sem valor exato)
 *  - toHaveBeenCalledTimes() → verifica quantas vezes o mock foi chamado
 */

// ── jest.mock() DEVE SER CHAMADO ANTES DOS IMPORTS ───────────────────────────
// O Jest hoist automaticamente para o topo, mas por clareza deixamos explícito.
// A factory retorna um objeto com as funções que usamos do bcrypt.
// Cada método vira um jest.fn() — podemos configurar retornos nos testes.
jest.mock('bcryptjs', () => ({
  hash:    jest.fn(),
  compare: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationException } from '../common/exceptions/application.exception';

// ─── Mock do PrismaService ────────────────────────────────────────────────────
function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      findMany:   jest.fn(),
      count:      jest.fn(),
    },
    refreshToken: {
      create:      jest.fn(),
      deleteMany:  jest.fn(),
      findFirst:   jest.fn(),
    },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const MOCK_USER_DB = {
  id:        1,
  name:      'João Silva',
  username:  'joao',
  phone:     '11999990000',
  password:  '$2a$12$hashedpassword', // hash fictício (não precisa ser real)
  role:      Role.USER,
  createdAt: new Date('2026-01-01'),
};

// Versão sem senha (o que sanitizeUser() retorna)
const MOCK_USER_SAFE = {
  id:        1,
  name:      'João Silva',
  username:  'joao',
  phone:     '11999990000',
  role:      'user', // role normalizado para lowercase
  createdAt: new Date('2026-01-01'),
};

// ═════════════════════════════════════════════════════════════════════════════
describe('AuthService', () => {
  let authService: AuthService;
  let prismaMock: PrismaMock;

  // O JwtService do NestJS precisa de configuração.
  // Usamos `useValue` para fornecer um objeto simples com apenas o método
  // que utilizamos (sign), sem precisar configurar o módulo inteiro.
  const jwtServiceMock = {
    sign: jest.fn().mockReturnValue('fake_access_token'),
  };

  beforeEach(async () => {
    prismaMock = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService,    useValue: jwtServiceMock },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  // beforeEach com clearAllMocks limpa o histórico de chamadas de todos
  // os jest.fn() antes de cada teste, sem restaurar implementações.
  // Como usamos jest.mock() (não spyOn), clearAllMocks é suficiente.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 1: register()
  // ═══════════════════════════════════════════════════════════════════════════
  describe('register()', () => {

    it('deve lançar CONFLICT quando o username já está em uso', async () => {
      // Simula que já existe um usuário com esse username
      prismaMock.user.findUnique.mockResolvedValue(MOCK_USER_DB);

      await expect(
        authService.register({ name: 'Outro', username: 'joao', password: '123456' }),
      ).rejects.toThrow(ApplicationException);

      // O banco NÃO deve ser chamado para criar, pois o erro ocorre antes
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('deve criar o usuário e retornar sem a senha', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null); // username disponível

      // ── Como usar um mock de módulo CJS ────────────────────────────────
      // bcrypt foi substituído pelo jest.mock() no topo do arquivo.
      // Para configurar o retorno, fazemos cast para jest.Mock e chamamos
      // mockResolvedValue (equivale a: async () => 'hashed_password').
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

      prismaMock.user.create.mockResolvedValue({
        ...MOCK_USER_DB,
        password: 'hashed_password',
      });

      const result = await authService.register({
        name:     'João Silva',
        username: 'Joao', // maiúscula intencional → deve ser normalizado
        password: 'senha123',
      });

      // A senha NÃO deve aparecer no objeto retornado
      expect(result).not.toHaveProperty('password');
      expect(result.username).toBe('joao');

      // Verificar que bcrypt.hash foi chamado exatamente 1 vez
      expect(bcrypt.hash as jest.Mock).toHaveBeenCalledTimes(1);

      // Verificar que o create foi chamado com username em lowercase
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: 'joao',
            role:     Role.USER,
            password: 'hashed_password',
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 2: login()
  // ═══════════════════════════════════════════════════════════════════════════
  describe('login()', () => {

    it('deve lançar INVALID_CREDENTIALS quando o usuário não existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ username: 'inexistente', password: '123' }),
      ).rejects.toThrow(ApplicationException);
    });

    it('deve lançar INVALID_CREDENTIALS quando a senha está errada', async () => {
      prismaMock.user.findUnique.mockResolvedValue(MOCK_USER_DB);

      // Configura bcrypt.compare para simular senha errada
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login({ username: 'joao', password: 'senha_errada' }),
      ).rejects.toThrow(ApplicationException);
    });

    it('deve retornar access_token, refresh_token e user quando credenciais são válidas', async () => {
      prismaMock.user.findUnique.mockResolvedValue(MOCK_USER_DB);

      // Senha correta → bcrypt.compare retorna true
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      prismaMock.refreshToken.create.mockResolvedValue({});

      const result = await authService.login({ username: 'joao', password: 'senha_certa' });

      // Verificar estrutura do retorno
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');

      // expect.any(String) aceita qualquer string sem precisar saber o valor exato
      expect(result.access_token).toEqual(expect.any(String));
      expect(result.refresh_token).toEqual(expect.any(String));

      // O user retornado não deve ter senha
      expect(result.user).not.toHaveProperty('password');

      // JWT deve ter sido gerado
      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: '1', username: 'joao' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 3: validateUser()
  // Usado pela estratégia JWT do Passport para validar cada requisição.
  // ═══════════════════════════════════════════════════════════════════════════
  describe('validateUser()', () => {

    it('deve retornar null quando o usuário não existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await authService.validateUser('inexistente', '123');
      expect(result).toBeNull();
    });

    it('deve retornar null quando a senha é inválida', async () => {
      prismaMock.user.findUnique.mockResolvedValue(MOCK_USER_DB);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await authService.validateUser('joao', 'errada');
      expect(result).toBeNull();
    });

    it('deve retornar o usuário sem senha quando credenciais são válidas', async () => {
      prismaMock.user.findUnique.mockResolvedValue(MOCK_USER_DB);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.validateUser('joao', 'certa');

      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty('password');
      expect(result!.username).toBe('joao');
      // Role deve estar em lowercase
      expect(result!.role).toBe('user');
    });
  });
});
