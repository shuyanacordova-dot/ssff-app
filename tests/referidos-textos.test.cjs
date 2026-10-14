// Run with: node --test tests/referidos-textos.test.cjs
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

const { dinero, mensajeCompartirCodigo, estadoReferidoLabel, tipoMovimientoLabel } = load('referidos-textos');
const { enlaceCompartirWhatsapp } = load('whatsapp');

test('dinero omite los decimales enteros y conserva los reales', () => {
  assert.equal(dinero(10), '$10');
  assert.equal(dinero(12.5), '$12.50');
});

test('mensaje de Círculo Shu', () => {
  const t = mensajeCompartirCodigo({ prefijo: 'SHU', descuento_bienvenida: 10 }, 'SHU-000458');
  assert.match(t, /CÍRCULO SHU/);
  assert.match(t, /Compartir una buena visión tiene recompensa\./);
  assert.match(t, /SHU-000458/);
  assert.match(t, /\$10 de descuento en tu primera compra de lentes/);
  assert.match(t, /Aplican condiciones\./);
  assert.doesNotMatch(t, /\*/);
});

test('mensaje de Focus Friends', () => {
  const t = mensajeCompartirCodigo({ prefijo: 'FOC', descuento_bienvenida: 15 }, 'FOC-000235');
  assert.match(t, /FOCUS FRIENDS/);
  assert.match(t, /Ver bien es mejor entre amigos\./);
  assert.match(t, /FOC-000235/);
  assert.match(t, /\$15 de descuento/);
  assert.doesNotMatch(t, /CÍRCULO/);
});

test('etiquetas en español', () => {
  assert.equal(estadoReferidoLabel('en_pago'), 'Esperando el pago completo');
  assert.equal(estadoReferidoLabel('recompensado'), 'Recompensado');
  assert.equal(estadoReferidoLabel('desconocido'), 'desconocido');
  assert.equal(tipoMovimientoLabel('bono_hito'), 'Bono por referidos');
  assert.equal(tipoMovimientoLabel('uso'), 'Crédito usado');
});

test('el enlace de compartir no lleva número y codifica el texto', () => {
  const url = enlaceCompartirWhatsapp('Hola mundo\nSegunda línea');
  assert.ok(url.startsWith('https://wa.me/?text='));
  assert.ok(url.includes(encodeURIComponent('Segunda línea')));
});
