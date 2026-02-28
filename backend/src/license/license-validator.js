const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { machineIdSync } = require('node-machine-id');

/**
 * Lee y valida la licencia completa.
 * Retorna objeto con valid: true/false y datos o reason.
 */
function getLicenseInfo() {
  // 1. Leer archivo license.key
  const licensePath = process.env.LICENSE_FILE
    ? path.resolve(process.env.LICENSE_FILE)
    : path.resolve(process.cwd(), 'license.key');

  if (!fs.existsSync(licensePath)) {
    // En producción sin license.key → modo demo (todas las funciones habilitadas)
    if (process.env.NODE_ENV === 'production') {
      return { valid: true, demo: true, reason: 'Demo mode (no license file)', companyName: process.env.COMPANY_NAME || 'Demo', customerName: 'Demo', expiresAt: null, maxWorkcells: null };
    }
    return { valid: false, reason: 'No license file found' };
  }

  const token = fs.readFileSync(licensePath, 'utf-8').trim();

  // 2. Obtener machine ID actual
  const machineId = machineIdSync();

  // 3. Verificar firma JWT
  let license;
  try {
    license = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { valid: false, reason: 'Invalid license signature' };
  }

  // 4. Verificar machine ID
  if (license.machineId !== machineId) {
    return { valid: false, reason: 'License not valid for this machine' };
  }

  // 5. Verificar expiración
  if (license.expiresAt <= Date.now()) {
    return { valid: false, reason: 'License expired', expiredAt: license.expiresAt };
  }

  // 6. Licencia válida
  return {
    valid: true,
    companyName: license.companyName,
    customerName: license.customerName,
    expiresAt: license.expiresAt,
    maxWorkcells: license.maxWorkcells,
    machineId: license.machineId,
    issuedAt: license.issuedAt,
  };
}

/**
 * Valida la licencia y muestra warnings si no es válida.
 * Siempre retorna el objeto de info.
 */
function validateLicense() {
  const info = getLicenseInfo();

  if (info.valid) {
    return info;
  }

  console.warn('LICENSE WARNING:', info.reason);
  return info;
}

module.exports = { getLicenseInfo, validateLicense };
