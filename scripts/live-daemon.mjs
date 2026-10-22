import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as baileysPkg from '@whiskeysockets/baileys';
import qrcodeTerminalPkg from 'qrcode-terminal';

const makeWASocket = baileysPkg.default?.default || baileysPkg.default || baileysPkg.makeWASocket;
const DisconnectReason = baileysPkg.DisconnectReason || baileysPkg.default?.DisconnectReason;
const useMultiFileAuthState = baileysPkg.useMultiFileAuthState || baileysPkg.default?.useMultiFileAuthState;
const fetchLatestBaileysVersion = baileysPkg.fetchLatestBaileysVersion || baileysPkg.default?.fetchLatestBaileysVersion;

const qrLib = qrcodeTerminalPkg.default || qrcodeTerminalPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sessionDir = path.resolve(projectRoot, 'data', 'live-session');

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

let currentSocket = null;
let currentQrCode = null;
let connectionStatus = 'initializing';
let connectedUser = null;
let lastError = null;
let currentPairingCode = null;

const PORT = process.env.PORT || 2785;

function log(message) {
  const timestamp = new Date().toISOString();
  process.stdout.write(`[${timestamp}] [OPENWA-DAEMON] ${message}\n`);
}

async function startWhatsAppSocket() {
  log('Menginisialisasi Baileys Multi-Device Engine...');
  connectionStatus = 'connecting';

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    let version;
    try {
      const versionInfo = await fetchLatestBaileysVersion();
      version = versionInfo.version;
    } catch {
      version = [2, 3000, 1015901307];
    }

    log(`Menggunakan versi WhatsApp Web: ${version.join('.')}`);

    const socketConfig = {
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['OpenWA Gateway', 'Chrome', '124.0.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: 60000
    };

    const sock = makeWASocket(socketConfig);
    currentSocket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQrCode = qr;
        connectionStatus = 'scan_required';
        const qrPath = path.resolve(sessionDir, 'last-qr.txt');
        fs.writeFileSync(qrPath, qr, 'utf8');

        log('================================================================');
        log('PERANGKAT WHATSAPP BELUM TERHUBUNG.');
        log('Silakan scan QR code di bawah ini menggunakan aplikasi WhatsApp:');
        log('Langkah: Buka WhatsApp -> Pengaturan / Titik Tiga -> Perangkat Tertaut -> Tautkan Perangkat');
        log(`Atau buka di browser: http://127.0.0.1:${PORT}/qr`);
        log('================================================================');

        try {
          if (qrLib && typeof qrLib.generate === 'function') {
            qrLib.generate(qr, { small: true });
          } else {
            log(`QR Code Payload: ${qr}`);
          }
        } catch (qrRenderErr) {
          log(`Catatan render terminal QR: ${qrRenderErr.message}`);
          log(`Silakan buka http://127.0.0.1:${PORT}/qr di browser Anda untuk melihat QR.`);
        }
      }

      if (connection === 'close') {
        currentQrCode = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';
        lastError = { statusCode, reason, timestamp: new Date().toISOString() };
        log(`Koneksi terputus. Kode status: ${statusCode || 'N/A'}. Alasan: ${reason}`);

        const loggedOutCode = DisconnectReason?.loggedOut ?? 401;
        const shouldReconnect = statusCode !== loggedOutCode;

        if (shouldReconnect) {
          connectionStatus = 'reconnecting';
          log('Mencoba menyambungkan kembali dalam 5 detik...');
          setTimeout(() => {
            startWhatsAppSocket();
          }, 5000);
        } else {
          connectionStatus = 'logged_out';
          log('Sesi ditutup / perangkat dikeluarkan (logged out). Menghapus cache sesi lama...');
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            fs.mkdirSync(sessionDir, { recursive: true });
          } catch (cleanErr) {
            log(`Gagal membersihkan direktori sesi: ${cleanErr.message}`);
          }
          log('Memulai ulang proses pairing dengan QR baru...');
          setTimeout(() => {
            startWhatsAppSocket();
          }, 2000);
        }
      }

      if (connection === 'open') {
        currentQrCode = null;
        currentPairingCode = null;
        connectionStatus = 'connected';
        lastError = null;

        const userId = sock.user?.id || 'Unknown';
        const userName = sock.user?.name || 'WhatsApp User';
        connectedUser = { id: userId, name: userName };

        log('================================================================');
        log('SUKSES: WHATSAPP ENGINE TELAH TERHUBUNG DAN AKTIF!');
        log(`ID Perangkat (JID): ${userId}`);
        log(`Nama Pengguna: ${userName}`);
        log(`Status: SIAP MENERIMA DAN MENGIRIM PESAN`);
        log('================================================================');

        const statusPath = path.resolve(sessionDir, 'session-info.json');
        fs.writeFileSync(
          statusPath,
          JSON.stringify(
            {
              status: 'connected',
              jid: userId,
              name: userName,
              connectedAt: new Date().toISOString()
            },
            null,
            2
          ),
          'utf8'
        );
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.key.fromMe) {
            const sender = msg.key.remoteJid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[Media / Non-text message]';
            log(`[PESAN MASUK] Dari: ${sender} | Pesan: ${text}`);
          }
        }
      }
    });
  } catch (err) {
    connectionStatus = 'error';
    lastError = { message: err.message, stack: err.stack, timestamp: new Date().toISOString() };
    log(`Kesalahan fatal inisialisasi socket Baileys: ${err.message}`);
    setTimeout(() => {
      startWhatsAppSocket();
    }, 10000);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error(`Invalid JSON: ${e.message}`));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data, null, 2));
}

function renderHtmlQrPage(res) {
  const isConnected = connectionStatus === 'connected';
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenWA Gateway - Live WhatsApp Pairing</title>
  <style>
    :root {
      --bg: #090a0f;
      --surface: #12151f;
      --border: #232838;
      --text: #f0f3fa;
      --text-muted: #8b95a8;
      --accent: #25d366;
      --accent-hover: #1ebd5a;
    }
    body {
      margin: 0;
      padding: 2rem;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      max-width: 520px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    h1 {
      font-size: 1.5rem;
      margin: 0 0 0.5rem 0;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 1.5rem;
      background: ${isConnected ? 'rgba(37,211,102,0.15)' : 'rgba(234,179,8,0.15)'};
      color: ${isConnected ? 'var(--accent)' : '#eab308'};
      border: 1px solid ${isConnected ? 'rgba(37,211,102,0.3)' : 'rgba(234,179,8,0.3)'};
    }
    .qr-container {
      background: #ffffff;
      padding: 1.25rem;
      border-radius: 8px;
      display: inline-block;
      margin: 1rem 0;
    }
    .instructions {
      text-align: left;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-top: 1.5rem;
      font-size: 0.9rem;
      color: var(--text-muted);
    }
    .instructions ol {
      margin: 0.5rem 0 0 1.25rem;
      padding: 0;
    }
    .instructions li {
      margin-bottom: 0.25rem;
    }
    .connected-box {
      padding: 2rem;
      border-radius: 8px;
      background: rgba(37,211,102,0.05);
      border: 1px solid rgba(37,211,102,0.2);
    }
    .code-box {
      font-family: monospace;
      background: #000;
      padding: 0.5rem;
      border-radius: 4px;
      word-break: break-all;
      font-size: 0.8rem;
      margin-top: 0.5rem;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
</head>
<body>
  <div class="card">
    <h1>OpenWA Live WhatsApp Gateway</h1>
    <div class="badge" id="statusBadge">Status: ${connectionStatus.toUpperCase()}</div>

    <div id="content">
      ${
        isConnected
          ? `
        <div class="connected-box">
          <h2 style="color: var(--accent); margin-top: 0;">Terhubung ke WhatsApp</h2>
          <p>Akun JID: <strong>${connectedUser?.id || '-'}</strong></p>
          <p>Nama: <strong>${connectedUser?.name || '-'}</strong></p>
          <p style="color: var(--text-muted); font-size: 0.85rem;">Engine aktif dan siap mengirim serta menerima pesan HTTP API.</p>
        </div>
      `
          : `
        <p style="color: var(--text-muted); font-size: 0.95rem;">
          Scan QR Code di bawah menggunakan WhatsApp di ponsel Anda:
        </p>
        <div class="qr-container">
          <canvas id="qrCanvas"></canvas>
        </div>
        <div class="instructions">
          <strong>Langkah Menghubungkan (Scan QR):</strong>
          <ol>
            <li>Buka aplikasi WhatsApp di ponsel Anda.</li>
            <li>Ketuk menu Titik Tiga (Android) atau Pengaturan (iOS).</li>
            <li>Pilih <strong>Perangkat Tertaut (Linked Devices)</strong>.</li>
            <li>Ketuk <strong>Tautkan Perangkat (Link a Device)</strong>.</li>
            <li>Arahkan kamera ke QR Code di atas.</li>
          </ol>
        </div>

        <div style="margin: 1.5rem 0 1rem 0; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          <span style="height: 1px; background: var(--border); flex: 1;"></span>
          <span style="color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">Atau Tautkan Dengan Nomor Telepon</span>
          <span style="height: 1px; background: var(--border); flex: 1;"></span>
        </div>

        <div style="display: flex; gap: 0.5rem; justify-content: center;">
          <input type="text" id="phoneInput" placeholder="Nomor WA (contoh: 6281234567890)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; color: var(--text); font-size: 0.9rem; width: 62%;">
          <button id="pairBtn" onclick="requestPairCode()" style="background: var(--accent); color: #000; border: none; border-radius: 6px; padding: 0.6rem 1rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">Minta Kode</button>
        </div>

        <div id="pairResult" style="display: none; margin-top: 1rem; background: rgba(37,211,102,0.1); border: 1px solid rgba(37,211,102,0.3); border-radius: 6px; padding: 0.8rem;">
          <div style="font-size: 0.85rem; color: var(--text-muted);">Masukkan kode 8-digit berikut di WhatsApp Anda:</div>
          <div id="pairCodeDisplay" style="font-family: monospace; font-size: 1.7rem; font-weight: 700; letter-spacing: 0.25em; color: var(--accent); margin: 0.5rem 0;"></div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Buka WhatsApp -> Perangkat Tertaut -> Tautkan dengan nomor telepon</div>
        </div>
      `
      }
    </div>
  </div>

  <script>
    let currentQr = ${JSON.stringify(currentQrCode)};
    let isConnected = ${isConnected};

    async function requestPairCode() {
      const phoneInput = document.getElementById('phoneInput');
      const btn = document.getElementById('pairBtn');
      const resDiv = document.getElementById('pairResult');
      const codeDisp = document.getElementById('pairCodeDisplay');
      const phone = phoneInput ? phoneInput.value.trim() : '';

      if (!phone) {
        alert('Silakan masukkan nomor WhatsApp Anda.');
        return;
      }

      btn.disabled = true;
      btn.innerText = 'Meminta...';

      try {
        const res = await fetch('/api/v1/pairing-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (data.pairingCode) {
          codeDisp.innerText = data.pairingCode;
          resDiv.style.display = 'block';
        } else {
          alert(data.error || 'Gagal meminta pairing code.');
        }
      } catch (err) {
        alert('Terjadi kesalahan: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerText = 'Minta Kode';
      }
    }

    function renderQr(qrText) {
      if (!qrText || isConnected) return;
      const canvas = document.getElementById('qrCanvas');
      if (canvas && window.QRCode) {
        window.QRCode.toCanvas(canvas, qrText, { width: 260, margin: 1 }, function (error) {
          if (error) console.error(error);
        });
      }
    }

    if (currentQr && !isConnected) {
      window.onload = function() {
        renderQr(currentQr);
      };
    }

    setInterval(async () => {
      try {
        const res = await fetch('/api/v1/status');
        const data = await res.json();
        const badge = document.getElementById('statusBadge');
        if (badge) badge.innerText = 'Status: ' + data.connectionStatus.toUpperCase();

        if (data.connected && !isConnected) {
          location.reload();
        } else if (!data.connected && isConnected) {
          location.reload();
        } else if (data.hasQr) {
          const qrRes = await fetch('/api/v1/qr');
          const qrData = await qrRes.json();
          if (qrData.qr && qrData.qr !== currentQr) {
            currentQr = qrData.qr;
            renderQr(currentQr);
          }
        }
      } catch (e) {
        console.error('Poller error', e);
      }
    }, 2500);
  </script>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  if ((pathname === '/' || pathname === '/qr') && method === 'GET') {
    renderHtmlQrPage(res);
    return;
  }

  if (pathname === '/api/v1/health' && method === 'GET') {
    sendJsonResponse(res, 200, {
      status: 'healthy',
      engine: 'baileys-multi-device',
      connectionStatus,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (pathname === '/api/v1/status' && method === 'GET') {
    sendJsonResponse(res, 200, {
      engine: 'baileys',
      connectionStatus,
      connected: connectionStatus === 'connected',
      user: connectedUser,
      lastError,
      hasQr: Boolean(currentQrCode),
      pairingCode: currentPairingCode,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (pathname === '/api/v1/qr' && method === 'GET') {
    if (!currentQrCode) {
      sendJsonResponse(res, 200, {
        status: connectionStatus,
        message: connectionStatus === 'connected'
          ? 'Perangkat sudah terhubung, tidak memerlukan QR scan.'
          : 'QR code belum siap atau sedang dimuat.',
        qr: null
      });
      return;
    }

    sendJsonResponse(res, 200, {
      status: 'scan_required',
      qr: currentQrCode,
      instructions: 'Buka WhatsApp -> Perangkat Tertaut -> Tautkan Perangkat lalu scan QR code ini.'
    });
    return;
  }

  if (pathname === '/api/v1/pairing-code' && method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { phoneNumber } = payload;
      if (!phoneNumber) {
        sendJsonResponse(res, 400, {
          error: 'Parameter phoneNumber wajib diisi (contoh: "6281234567890").'
        });
        return;
      }

      if (!currentSocket) {
        sendJsonResponse(res, 503, {
          error: 'Engine belum siap menerima permintaan pairing code.'
        });
        return;
      }

      const cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
      log(`Meminta 8-digit Pairing Code untuk nomor: ${cleanPhone}`);
      const code = await currentSocket.requestPairingCode(cleanPhone);
      currentPairingCode = code;

      log(`Pairing code diterima: ${code}`);
      sendJsonResponse(res, 200, {
        success: true,
        phoneNumber: cleanPhone,
        pairingCode: code,
        instructions: 'Buka WhatsApp -> Perangkat Tertaut -> Tautkan dengan nomor telepon -> Masukkan 8 karakter ini.'
      });
    } catch (pairErr) {
      log(`Gagal meminta pairing code: ${pairErr.message}`);
      sendJsonResponse(res, 500, {
        error: `Gagal meminta pairing code: ${pairErr.message}`
      });
    }
    return;
  }

  if (pathname === '/api/v1/messages/send-text' && method === 'POST') {
    if (connectionStatus !== 'connected' || !currentSocket) {
      sendJsonResponse(res, 503, {
        error: 'Engine belum terhubung dengan WhatsApp. Silakan scan QR code terlebih dahulu.',
        connectionStatus
      });
      return;
    }

    try {
      const payload = await parseJsonBody(req);
      const { to, message } = payload;

      if (!to || !message) {
        sendJsonResponse(res, 400, {
          error: 'Parameter wajib to dan message harus disertakan dalam body JSON.'
        });
        return;
      }

      let targetJid = String(to).trim();
      if (!targetJid.includes('@')) {
        targetJid = `${targetJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      }

      log(`Mengirim pesan teks ke ${targetJid}: "${message}"`);
      const sendResult = await currentSocket.sendMessage(targetJid, { text: message });

      sendJsonResponse(res, 200, {
        success: true,
        messageId: sendResult?.key?.id,
        recipient: targetJid,
        timestamp: new Date().toISOString()
      });
    } catch (sendErr) {
      log(`Gagal mengirim pesan: ${sendErr.message}`);
      sendJsonResponse(res, 500, {
        error: `Gagal mengirim pesan: ${sendErr.message}`
      });
    }
    return;
  }

  if (pathname === '/api/v1/logout' && method === 'POST') {
    try {
      if (currentSocket) {
        await currentSocket.logout();
      }
      sendJsonResponse(res, 200, {
        success: true,
        message: 'Berhasil keluar dari sesi WhatsApp.'
      });
    } catch (logoutErr) {
      sendJsonResponse(res, 500, {
        error: `Gagal keluar dari sesi: ${logoutErr.message}`
      });
    }
    return;
  }

  sendJsonResponse(res, 404, {
    error: 'Endpoint tidak ditemukan.',
    availableEndpoints: [
      'GET  /',
      'GET  /qr',
      'GET  /api/v1/health',
      'GET  /api/v1/status',
      'GET  /api/v1/qr',
      'POST /api/v1/pairing-code',
      'POST /api/v1/messages/send-text',
      'POST /api/v1/logout'
    ]
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`OpenWA Live Local Daemon berjalan pada http://127.0.0.1:${PORT}`);
  log(`Buka http://127.0.0.1:${PORT}/qr di browser Anda untuk melihat antarmuka pairing.`);
  startWhatsAppSocket();
});

function gracefulShutdown(signal) {
  log(`Menerima sinyal ${signal}. Menutup server dan koneksi...`);
  server.close(() => {
    if (currentSocket) {
      try {
        currentSocket.end();
      } catch {}
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
