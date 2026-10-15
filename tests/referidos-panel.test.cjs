// Run with: node --test tests/referidos-panel.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const filename = path.resolve(__dirname, '../lib', file + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => load(name.replace('./', '').replace('@/lib/', '')), module, module.exports);
  return module.exports;
}

const { hoyEcuador, atajoPeriodo, periodoPorDefecto, periodoValido, porcentaje, dineroPanel, ordenarRanking, esUuid } = load('referidos-panel');

test('hoyEcuador usa la fecha de Ecuador y no la de UTC', () => {
  // 03:00 UTC del 15-oct = 22:00 del 14-oct en Ecuador
  assert.equal(hoyEcuador(new Date('2026-10-15T03:00:00Z')), '2026-10-14');
  assert.equal(hoyEcuador(new Date('2026-10-15T05:00:00Z')), '2026-10-15');
});

test('periodo por defecto = del 1 del mes hasta hoy (Ecuador)', () => {
  assert.deepEqual(periodoPorDefecto(new Date('2026-10-15T03:00:00Z')), { desde: '2026-10-01', hasta: '2026-10-14' });
});

test('atajos: este mes, mes pasado (incluye enero) y últimos 30 días', () => {
  const ahora = new Date('2026-10-15T03:00:00Z');
  assert.deepEqual(atajoPeriodo('este_mes', ahora), { desde: '2026-10-01', hasta: '2026-10-14' });
  assert.deepEqual(atajoPeriodo('mes_pasado', ahora), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(atajoPeriodo('ultimos_30', ahora), { desde: '2026-09-15', hasta: '2026-10-14' });
  assert.deepEqual(atajoPeriodo('mes_pasado', new Date('2026-01-05T15:00:00Z')), { desde: '2025-12-01', hasta: '2025-12-31' });
  assert.deepEqual(atajoPeriodo('mes_pasado', new Date('2026-03-10T15:00:00Z')), { desde: '2026-02-01', hasta: '2026-02-28' });
});

test('periodoValido acepta fechas reales y rechaza lo demás', () => {
  assert.deepEqual(periodoValido('2026-10-01', '2026-10-31'), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.equal(periodoValido('2026-10-05', '2026-10-01'), null);
  assert.equal(periodoValido('2026-13-01', '2026-13-02'), null);
  assert.equal(periodoValido('2026-02-30', '2026-03-01'), null);
  assert.equal(periodoValido('hola', '2026-10-01'), null);
  assert.equal(periodoValido(undefined, '2026-10-01'), null);
  assert.equal(periodoValido('2025-01-01', '2026-10-01'), null);
  assert.deepEqual(periodoValido('2026-01-01', '2026-12-31'), { desde: '2026-01-01', hasta: '2026-12-31' });
});

test('formato de porcentaje y dinero', () => {
  assert.equal(porcentaje(66.7), '66,7 %');
  assert.equal(porcentaje(null), '—');
  assert.equal(porcentaje(undefined), '—');
  assert.equal(dineroPanel(630), '$630.00');
  assert.equal(dineroPanel(157.5), '$157.50');
  assert.equal(dineroPanel(null), '—');
});

const fila = (nombre, extra = {}) => ({ paciente_id: nombre, nombre, codigo: null, exitosos: 0, ventas: 0, credito_ganado: 0, disponible: 0, ...extra });

test('ordenarRanking: mayor primero, empates por nombre, sin cambiar la lista original', () => {
  const lista = [fila('Zoe', { ventas: 100 }), fila('Ana', { ventas: 100 }), fila('Beto', { ventas: 300 })];
  assert.deepEqual(ordenarRanking(lista, 'ventas').map((f) => f.nombre), ['Beto', 'Ana', 'Zoe']);
  assert.deepEqual(lista.map((f) => f.nombre), ['Zoe', 'Ana', 'Beto']);
});

test('ordenarRanking: valores que llegan como texto o vacíos no rompen el orden', () => {
  const lista = [fila('Ana', { disponible: '9.50' }), fila('Beto', { disponible: null }), fila('Carla', { disponible: '12.00' })];
  assert.deepEqual(ordenarRanking(lista, 'disponible').map((f) => f.nombre), ['Carla', 'Ana', 'Beto']);
});

test('esUuid solo acepta identificadores completos', () => {
  assert.equal(esUuid('3bd2a17c-1a2b-4c3d-8e4f-5a6b7c8d9e0f'), true);
  assert.equal(esUuid('todas'), false);
  assert.equal(esUuid("3bd2a17c'; drop"), false);
  assert.equal(esUuid(undefined), false);
});
