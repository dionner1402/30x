import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cashAwareScore, scheduleCashAware } from './cash-aware';

describe('cash-aware scheduler (A5)', () => {
  const now = new Date('2026-10-17T12:00:00Z');

  it('elige urgentes que caben y difiere el resto', () => {
    const result = scheduleCashAware(
      [
        { id: 'a', amount: 400, dueDate: '2026-10-18', eligible: true, label: 'soon' },
        { id: 'b', amount: 500, dueDate: '2026-10-25', eligible: true, label: 'later' },
        { id: 'c', amount: 300, dueDate: '2026-10-19', eligible: true, label: 'mid' },
        { id: 'd', amount: 200, dueDate: '2026-10-20', eligible: false, label: 'hold' },
      ],
      800,
      now,
    );

    // a (más urgente) + c; b no cabe / peor urgencia
    assert.ok(result.selected.some((s) => s.id === 'a'));
    assert.ok(result.spent <= 800);
    assert.ok(result.deferred.some((d) => d.id === 'd' && d.reason === 'not_eligible'));
    assert.ok(result.deferred.some((d) => d.reason === 'budget_deferred'));
  });

  it('budget 0 → todo deferred si elegible', () => {
    const result = scheduleCashAware(
      [{ id: 'x', amount: 10, eligible: true }],
      0,
      now,
    );
    assert.equal(result.selected.length, 0);
    assert.equal(result.deferred[0]?.reason, 'budget_deferred');
  });

  it('score prioriza dueDate más cercano', () => {
    const soon = cashAwareScore({ amount: 100, dueDate: '2026-10-18' }, now);
    const later = cashAwareScore({ amount: 100, dueDate: '2026-11-01' }, now);
    assert.ok(soon > later);
  });

  it('maximiza fill: varios pequeños vs uno grande', () => {
    // budget 1000: grande 900 due tarde vs dos urgentes 400+400
    const result = scheduleCashAware(
      [
        { id: 'big', amount: 900, dueDate: '2026-12-01', eligible: true },
        { id: 'u1', amount: 400, dueDate: '2026-10-18', eligible: true },
        { id: 'u2', amount: 400, dueDate: '2026-10-18', eligible: true },
      ],
      1000,
      now,
    );
    const ids = result.selected.map((s) => s.id).sort();
    assert.deepEqual(ids, ['u1', 'u2']);
    assert.ok(result.deferred.some((d) => d.id === 'big'));
  });

  it('mismo due → llena con varios pequeños', () => {
    const result = scheduleCashAware(
      [
        { id: 'big', amount: 800, dueDate: '2026-10-30', eligible: true },
        { id: 's1', amount: 200, dueDate: '2026-10-30', eligible: true },
        { id: 's2', amount: 250, dueDate: '2026-10-30', eligible: true },
        { id: 's3', amount: 300, dueDate: '2026-10-30', eligible: true },
      ],
      900,
      now,
    );
    assert.ok(result.selected.length >= 3);
    assert.ok(result.spent <= 900);
    assert.ok(result.deferred.some((d) => d.id === 'big'));
  });
});
