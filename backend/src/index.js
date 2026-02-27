require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const pool = require('./db/connection');

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

// Servir frontend en producción
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Simulator (solo en desarrollo con ENABLE_SIMULATOR=true)
if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_SIMULATOR === 'true') {
  const { startSimulator } = require('./engine/simulator');
  startSimulator();
}

// PLC connectors (producción o ENABLE_MODBUS=true activa ambos)
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_MODBUS === 'true') {
  const { startModbusConnectors } = require('./connectors/modbus');
  const { startEthernetIPConnectors } = require('./connectors/ethernet-ip');
  startModbusConnectors();
  startEthernetIPConnectors();
}

// OEE Engine
const { startEngine } = require('./engine/oee-calculator');
startEngine();

const PORT = process.env.PORT || 3000;

// WebSocket
const { startWebSocket } = require('./websocket/server');

server.listen(PORT, () => {
  console.log(`OEE Box Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  startWebSocket(server);
});

module.exports = { app, server };
