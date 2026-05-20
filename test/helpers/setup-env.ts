import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Carregado via setupFiles no jest-e2e.json antes de qualquer módulo de teste.
// override: true garante que variáveis do .env.test sobrescrevem o processo atual.
dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true });
