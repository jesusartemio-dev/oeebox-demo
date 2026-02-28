const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { machineIdSync } = require('node-machine-id');

/**
 * Lee y valida la licencia completa.
 * Retorna objeto con valid: true/false y datos o reason.
 */
function getLicenseInfo() {
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Buscar archivo license.key
  const licensePath = process.env.LICENSE_FILE
    ? path.resolve(process.env.LICENSE_FILE)
    : path.resolve(process.cwd(), 'license.key');

  const fileExists = fs.existsSync(licensePath);

  // En producción sin license.key → modo demo completo
  if (!fileExists && isProduction) {
    return { valid: true, demo: true, reason: 'Demo mode (no license file)', companyName: process.env.COMPANY_NAME || 'Demo', customerName: 'Demo', expiresAt: null, maxWorkcells: null };
  }

  if (!fileExists) {
    return { valid: false, reason: 'No license file found' };
  }

  const token = fs.readFileSync(licensePath, 'utf-8').trim();
  if (!token) {
    if (isProduction) {
      return { valid: true, demo: true, reason: 'Demo mode (empty license file)', companyName: process.env.COMPANY_NAME || 'Demo', customerName: 'Demo', expiresAt: null, maxWorkcells: null };
    }
    return { valid: false, reason: 'License file is empty' };
  }

  // 2. Obtener machine ID actual
  let machineId;
  try {
    machineId = machineIdSync();
  } catch {
    if (isProduction) {
      return { valid: true, demo: true, reason: 'Demo mode (cannot read machine ID)', companyName: process.env.COMPANY_NAME || 'Demo', customerName: 'Demo', expiresAt: null, maxWorkcells: null };
    }
    return { valid: false, reason: 'Cannot read machine ID' };
  }

  // 3. Verificar firma JWT
  let license;
  try {
    license = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    if (isProduction) {
      return { valid: true, demo: true, reason: 'Demo mode (invalid license signature)', companyName: process.env.COMPANY_NAME || 'Demo', customerName: 'Demo', expiresAt: null, maxWorkcells: null };
    }
    return { valid: false, reason: 'Invalid license signature' };
  }

  // 4. Verificar machine ID
  if (license.machineId !== machineId) {
    if (isProduction) {
      return { valid: true, demo: true, reason: 'Demo mode (machine ID mismatch)', companyName: process.env.COMPANY_NAME || 'Demo', customerName: 'Demo', expiresAt: null, maxWorkcells: null };
    }
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
