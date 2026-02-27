const { WebSocketServer } = require('ws');
const { query } = require('../db/connection');

const clients = new Set();
let intervalId = null;

async function getPlcState() {
  const { rows } = await query(`
    SELECT ps.*,
           w.code AS workcell_code,
           w.name AS workcell_name
      FROM plc_state ps
      JOIN workcells w ON w.id = ps.workcell_id
     WHERE w.active = true
     ORDER BY w.code ASC
  `);
  return rows;
}

function broadcast(data) {
  const message = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(message);
      } catch (err) {
        console.error('WebSocket send error:', err.message);
      }
    }
  }
}

function startWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws) => {
    clients.add(ws);

    // Enviar estado actual inmediatamente
    try {
      const state = await getPlcState();
      ws.send(JSON.stringify(state));
    } catch (err) {
      console.error('WebSocket initial state error:', err.message);
    }

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  // Broadcast cada 1 segundo
  intervalId = setInterval(async () => {
    if (clients.size === 0) return;
    try {
      const state = await getPlcState();
      broadcast(state);
    } catch (err) {
      console.error('WebSocket broadcast error:', err.message);
    }
  }, 1000);

  console.log('WebSocket server started');
}

function stopWebSocket() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  for (const ws of clients) {
    ws.close();
  }
  clients.clear();
}

module.exports = { startWebSocket, broadcast };
