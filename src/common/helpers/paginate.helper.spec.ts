/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  AULA 1 – Testando uma FUNÇÃO PURA (sem banco, sem mocks)               │
 * │                                                                         │
 * │  Uma função pura é aquela que:                                          │
 * │   • só depende dos argumentos que recebe                                │
 * │   • não tem efeitos colaterais (não chama banco, não escreve arquivo)   │
 * │                                                                         │
 * │  Esse é o tipo mais simples de teste — perfeito para começar.           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * CONCEITOS NOVOS NESTE ARQUIVO:
 *  - describe()  → agrupa testes relacionados (como uma pasta)
 *  - it()        → define um caso de teste individual (sinônimo de test())
 *  - expect()    → começa uma asserção: "eu espero que X seja Y"
 *  - toBe()      → igualdade estrita (===), bom para primitivos
 *  - toEqual()   → igualdade profunda, bom para objetos e arrays
 *  - toHaveLength() → verifica .length
 */

import { paginate } from './paginate.helper';

// ─── describe() ──────────────────────────────────────────────────────────────
// Agrupa todos os testes que testam `paginate`.
// Você pode ter describes aninhados para organizar melhor.
describe('paginate()', () => {

  // ─── Caso 1: página 1 com 3 itens num total de 10 ──────────────────────────
  it('deve retornar os dados e metadados corretos na página 1', () => {
    // ── ARRANGE (preparar) ──
    // Monte os dados de entrada do cenário
    const fakeData = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const total = 10;
    const page  = 1;
    const limit = 3;

    // ── ACT (agir) ──
    // Chame a função que está sendo testada
    const result = paginate(fakeData, total, page, limit);

    // ── ASSERT (afirmar) ──
    // Verifique se o resultado é o esperado.
    // toEqual() faz comparação profunda de objetos inteiros.
    expect(result.data).toEqual(fakeData);
    expect(result.meta).toEqual({
      total: 10,
      page: 1,
      limit: 3,
      totalPages: 4, // Math.ceil(10 / 3) = 4
    });
  });

  // ─── Caso 2: última página ──────────────────────────────────────────────────
  it('deve calcular totalPages corretamente para divisão não exata', () => {
    // 7 itens, 3 por página → precisa de 3 páginas (3+3+1)
    const result = paginate([], 7, 3, 3);
    expect(result.meta.totalPages).toBe(3); // toBe usa ===
    expect(result.meta.page).toBe(3);
  });

  // ─── Caso 3: resultado vazio ────────────────────────────────────────────────
  it('deve retornar array vazio quando não há dados', () => {
    const result = paginate([], 0, 1, 20);

    // toHaveLength verifica o tamanho de arrays e strings
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0); // Math.ceil(0/20) = 0
  });

  // ─── Caso 4: total exatamente divisível ────────────────────────────────────
  it('deve calcular totalPages exato quando total é múltiplo do limit', () => {
    // 20 itens, 10 por página → exatamente 2 páginas (sem arredondamento)
    const result = paginate([], 20, 1, 10);
    expect(result.meta.totalPages).toBe(2);
  });

  // ─── Caso 5: dados são passados sem modificação ─────────────────────────────
  it('deve retornar os dados originais sem mutá-los', () => {
    const original = [{ id: 99, name: 'João' }];
    const result = paginate(original, 1, 1, 10);

    // toBe verifica mesma referência de memória (não cópia)
    expect(result.data).toBe(original);
  });
});
