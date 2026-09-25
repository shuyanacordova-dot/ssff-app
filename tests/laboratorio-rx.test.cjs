// Run with: node --test tests/laboratorio-rx.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the pure TypeScript helpers without a server, database, or extra test dependency.
function load(file) {
  const filename = path.resolve(__dirname, '../lib', file + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => load(name.replace('./', '')), module, module.exports);
  return module.exports;
}
const { normalizeRxNumber: normalize, stepRxNumber: step } = load('rx-number');
const { emptyRx, rxCerca, rxIntermedia, transponer, dnpCerca, normalizarRx, calcularUso } = load('laboratorio');

const fixture = () => ({
  od: { esfera: '-1,25', cilindro: '-0.50', eje: '180', add: '+2.00', dnp: '31,5', procesar: true },
  oi: { esfera: '+0.50', cilindro: '-1.00', eje: '90', add: '+1.75', dnp: '32', procesar: false },
});

test('legacy signs, comma decimals, ranges, blank values and step boundaries', () => {
  assert.equal(normalize('1,25', 'esfera'), '+1.25');
  assert.equal(normalize('−0.50', 'esfera'), '-0.50');
  assert.equal(normalize('1.5', 'cilindro'), '-1.50');
  assert.equal(normalize('-1.5', 'cilindro'), '-1.50');
  assert.equal(normalize('-2', 'add'), '+2.00');
  assert.equal(normalize('.25', 'add'), '+0.75');
  assert.equal(normalize('5', 'add'), '+4.00');
  assert.equal(normalize('', 'esfera'), '');
  assert.equal(normalize('0', 'add'), '0.00');
  assert.equal(normalize('181.5', 'eje'), '180');
  assert.equal(step('180', 'eje', 1), '0');
  assert.equal(step('0', 'eje', -1), '180');
  assert.equal(step('0', 'cilindro', 1), '0.00');
  assert.equal(step('', 'add', 1), '+0.75');
  assert.equal(step('4', 'add', 1), '+4.00');
  assert.equal(step('-0.25', 'esfera', 1), '0.00');
});

test('near and intermediate Rx keep exam intact and preserve cylinder, axis, processing flags', () => {
  const rx = fixture(); const original = structuredClone(rx);
  const near = rxCerca(rx); const intermediate = rxIntermedia(rx);
  assert.equal(near.od.esfera, '+0.75'); assert.equal(near.oi.esfera, '+2.25');
  assert.equal(near.od.add, '0.00'); assert.equal(near.od.dnp, '30');
  assert.equal(near.od.cilindro, rx.od.cilindro); assert.equal(near.od.eje, rx.od.eje);
  assert.equal(near.oi.procesar, false);
  assert.equal(intermediate.od.esfera, '-0.25'); assert.equal(intermediate.oi.esfera, '+1.50');
  assert.equal(intermediate.od.dnp, rx.od.dnp); assert.equal(intermediate.od.add, '0.00');
  assert.deepEqual(rx, original); assert.deepEqual(rxCerca(rx), near);
  assert.equal(calcularUso(rx), 'lejos_y_cerca');
  assert.equal(normalizarRx(rx).od.dnp, '31.5');
  assert.equal(dnpCerca('63,5', true), '60.5'); assert.equal(dnpCerca(''), '');
});

test('blank sphere with an addition is plano; no addition does not invent a power', () => {
  const rx = emptyRx(); rx.od.add = '2,00';
  assert.equal(calcularUso(rx), 'cerca'); assert.equal(rxCerca(rx).od.esfera, '+2.00');
  assert.equal(rxCerca(emptyRx()).od.esfera, '');
  rx.od.add = ''; rx.od.esfera = '-1.25';
  assert.equal(rxCerca(rx).od.esfera, '-1.25');
});

test('explicit transposition preserves optical equivalence and wraps axis in 1–180', () => {
  assert.deepEqual(transponer({ esfera: '-1,25', cilindro: '+0,50', eje: '180' }), {
    esfera: '-0.75', cilindro: '-0.50', eje: '90',
  });
  assert.equal(transponer({ esfera: '0', cilindro: '1', eje: '90' }).eje, '180');
  assert.equal(transponer({ esfera: '0', cilindro: '1', eje: '0' }).eje, '90');
  const original = { esfera: '+1.00', cilindro: '-2.00', eje: '45' };
  assert.deepEqual(transponer(transponer(original)), original);
});
