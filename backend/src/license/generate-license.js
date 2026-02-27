#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const jwt = require('jsonwebtoken');

// ── Uso ─────────────────────────────────────────────────────
// node generate-license.js <machineId> <companyName> <customerName> <days> <maxWorkcells>
// Ejemplo:
//   node generate-license.js abc123 "GYS Automation" "Planta Norte" 365 5

const args = process.argv.slice(2);

if (args.length < 5) {
  console.error('Uso: node generate-license.js <machineId> <companyName> <customerName> <days> <maxWorkcells>');
  console.error('Ejemplo: node generate-license.js abc123 "GYS Automation" "Planta Norte" 365 5');
  process.exit(1);
}

const [machineId, companyName, customerName, daysStr, maxWorkcellsStr] = args;

const days = parseInt(daysStr, 10);
const maxWorkcells = parseInt(maxWorkcellsStr, 10);

if (isNaN(days) || days <= 0) {
  console.error('Error: days debe ser un número positivo');
  process.exit(1);
}

if (isNaN(maxWorkcells) || maxWorkcells <= 0) {
  console.error('Error: maxWorkcells debe ser un número positivo');
  process.exit(1);
}

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Error: JWT_SECRET no encontrado en .env');
  process.exit(1);
}

// ── Payload ─────────────────────────────────────────────────

const payload = {
  machineId,
  companyName,
  customerName,
  expiresAt: Date.now() + (days * 24 * 60 * 60 * 1000),
  maxWorkcells,
  issuedAt: Date.now(),
  version: '1.0',
};

// Firmar sin timestamp de JWT (usamos nuestro propio issuedAt/expiresAt)
const token = jwt.sign(payload, secret, { noTimestamp: true });

// ── Guardar archivo ─────────────────────────────────────────

const sanitized = customerName.replace(/[^a-zA-Z0-9_-]/g, '_');
const dateStr = new Date().toISOString().slice(0, 10);
const filename = `license-${sanitized}-${dateStr}.key`;

fs.writeFileSync(filename, token, 'utf-8');

// ── Resumen ─────────────────────────────────────────────────

const expiresDate = new Date(payload.expiresAt);

console.log('\n══════════════════════════════════════════════');
console.log('  OEE Box — Licencia generada exitosamente');
console.log('══════════════════════════════════════════════');
console.log(`  Archivo:       ${filename}`);
console.log(`  Machine ID:    ${machineId}`);
console.log(`  Empresa:       ${companyName}`);
console.log(`  Cliente:       ${customerName}`);
console.log(`  Workcells max: ${maxWorkcells}`);
console.log(`  Válida por:    ${days} días`);
console.log(`  Vence:         ${expiresDate.toLocaleDateString('es-MX')} ${expiresDate.toLocaleTimeString('es-MX')}`);
console.log('══════════════════════════════════════════════');
console.log('\nContenido del archivo:');
console.log(token);
console.log('');
