#!/usr/bin/env node
const { machineIdSync } = require('node-machine-id');

const machineId = machineIdSync();

console.log('══════════════════════════════════════════════');
console.log('  OEE Box — Machine ID');
console.log('══════════════════════════════════════════════');
console.log(`  ${machineId}`);
console.log('══════════════════════════════════════════════');
console.log('\nEnvía este ID a GYS para generar tu licencia.');
