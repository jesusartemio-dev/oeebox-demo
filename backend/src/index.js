require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const pool = require('./db/connection');
const { validateLicense } = require('./license/license-validator');

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/workcells', require('./routes/workcells'));
app.use('/api/oee', require('./routes/oee'));
app.use('/api/events', require('./routes/events'));
app.use('/api/config', require('./routes/config'));
app.use('/api/reports', require('./routes/reports'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), version: '1.0.0' });
});

// License status (sin auth — el frontend lo necesita antes del login)
app.get('/api/license/status', (req, res) => {
  const info = global.licenseInfo || { valid: false, reason: 'Not initialized' };
  res.json({
    valid: info.valid,
    companyName: info.companyName || null,
    customerName: info.customerName || null,
    expiresAt: info.expiresAt || null,
    maxWorkcells: info.maxWorkcells || null,
    reason: info.reason || null,
  });
});

// Servir frontend en producción
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Simulator (solo en desarrollo con ENABLE_SIMULATOR=true)
if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_SIMULATOR === 'true') {
  const { startSimulator } = require('./engine/simulator');
  startSimulator().catch(err => console.warn('Simulator startup error:', err.message));
}

// PLC connectors (producción o ENABLE_MODBUS=true activa todos)
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_MODBUS === 'true') {
  const { startModbusConnectors } = require('./connectors/modbus');
  const { startEthernetIPConnectors } = require('./connectors/ethernet-ip');
  const { startOpcuaConnectors } = require('./connectors/opcua');
  startModbusConnectors();
  startEthernetIPConnectors();
  startOpcuaConnectors();
}

// OEE Engine
const { startEngine } = require('./engine/oee-calculator');
startEngine().catch(err => console.warn('OEE Engine startup error:', err.message));

const PORT = process.env.PORT || 3000;

// WebSocket
const { startWebSocket } = require('./websocket/server');

// License validation
global.licenseInfo = validateLicense();
if (global.licenseInfo.demo) {
  console.log(`Running in DEMO mode — all features enabled`);
} else if (global.licenseInfo.valid) {
  const expires = new Date(global.licenseInfo.expiresAt).toLocaleDateString('es-MX');
  console.log(`License valid for: ${global.licenseInfo.companyName} - expires: ${expires}`);
} else {
  console.warn(`Running in READ-ONLY mode: ${global.licenseInfo.reason}`);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OEE Box Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  startWebSocket(server);
});

module.exports = { app, server };
