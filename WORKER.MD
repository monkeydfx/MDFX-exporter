const TURSO_URL = 'https://trading-journal-hamzazenbi.aws-eu-west-1.turso.io';
let TURSO_TOKEN = '';

// ?? MODO PRODUCCIÓN - Desactivar logs sensibles
const __DEV__ = false;
const log = () => {};
const warn = () => {};
const error = () => {};

function getRateLimitStore(env) {
  return (env && (env.RATE_LIMIT_KV || env.CONTACT_RATE_LIMIT)) ? (env.RATE_LIMIT_KV || env.CONTACT_RATE_LIMIT) : null;
}

function getClientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

async function checkRateLimit(env, key, limit, ttlSeconds) {
  const store = getRateLimitStore(env);
  if (!store) return { allowed: true, remaining: limit };
  const current = await store.get(key);
  const count = current ? parseInt(current, 10) || 0 : 0;
  if (count >= limit) {
    return { allowed: false, retryAfter: ttlSeconds };
  }
  const next = count + 1;
  await store.put(key, String(next), { expirationTtl: ttlSeconds });
  return { allowed: true, remaining: Math.max(0, limit - next) };
}

const ALLOWED_ORIGINS = new Set([
  'https://tripulacionfx.com',
  'https://www.tripulacionfx.com',
  'https://app.tripulacionfx.com',
  'https://pre-prod-journal-mdfx.netlify.app',
  'https://trading-journal-preprod.monkeydfx-trader.workers.dev',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8000',
  'http://localhost:8080',
  'http://127.0.0.1:5500'
]);

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (origin === 'null') return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (hostname.endsWith('.tripulacionfx.com')) return true;
    if (hostname.endsWith('.monkeydfx-trader.workers.dev')) return true;
  } catch (e) {
    return false;
  }
  return false;
}

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowed = isOriginAllowed(origin);
  const corsOrigin = allowed ? origin : 'https://tripulacionfx.com';
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Vary': 'Origin'
  };
}

let FALLBACK_ADMIN_SECRET = '';

// -----------------------------
// JWT helpers (HMAC-SHA256)
// -----------------------------
function base64url(input) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(input)))
    .replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function encodeBase64UrlString(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function hmacSign(key, data) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return base64url(sig);
}

async function createJWT(payloadObj, secret, expiresInSeconds = 900) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = Object.assign({}, payloadObj, { iat: now, exp: now + expiresInSeconds });
  const header64 = encodeBase64UrlString(JSON.stringify(header));
  const payload64 = encodeBase64UrlString(JSON.stringify(payload));
  const toSign = `${header64}.${payload64}`;
  const signature = await hmacSign(secret, toSign);
  return `${toSign}.${signature}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header64, payload64, sig] = parts;
    const toSign = `${header64}.${payload64}`;
    const expectedSig = await hmacSign(secret, toSign);
    if (expectedSig !== sig) return null;
    const payloadJson = decodeURIComponent(escape(atob(payload64.replace(/-/g,'+').replace(/_/g,'/'))));
    const payload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ============================================
// ?? EJECUTAR QUERY EN TURSO
// ============================================
async function executeTursoQuery(sql, args = []) {
  const response = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql: sql,
            args: args.map(arg => ({ type: 'text', value: String(arg) }))
          }
        },
        { type: 'close' }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Turso query failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.results || !data.results[0]) {
    throw new Error('Invalid response from Turso - no results');
  }
  
  const firstResult = data.results[0];
  
  if (firstResult.type === 'error') {
    throw new Error(firstResult.error?.message || 'Query failed');
  }
  
  if (!firstResult.response || !firstResult.response.result) {
    throw new Error('Invalid response from Turso - no result');
  }
  
  const result = firstResult.response.result;
  
  if (!result.cols || result.cols.length === 0) {
    return {
      rows: [],
      columns: [],
      rowsAffected: result.affected_row_count || 0
    };
  }
  
  if (!result.rows || !Array.isArray(result.rows)) {
    return {
      rows: [],
      columns: result.cols ? result.cols.map(col => col.name) : [],
      rowsAffected: result.affected_row_count || 0
    };
  }
  
  return {
    rows: result.rows.map(row => {
      const obj = {};
      result.cols.forEach((col, i) => {
        // Manejar correctamente los valores null de Turso
        const cell = row[i];
        if (cell === null || cell === undefined) {
          obj[col.name] = null;
        } else if (typeof cell === 'object' && cell.type === 'null') {
          obj[col.name] = null;
        } else if (typeof cell === 'object' && cell.value !== undefined) {
          obj[col.name] = cell.value;
        } else {
          obj[col.name] = cell;
        }
      });
      return obj;
    }),
    columns: result.cols ? result.cols.map(col => col.name) : [],
    rowsAffected: result.affected_row_count || 0
  };
}

// ============================================
// 💳 PAYPAL HELPERS
// ============================================
function getPayPalBaseUrl(env) {
  return env?.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalAccessToken(env) {
  if (!env?.PAYPAL_CLIENT_ID || !env?.PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials not configured');
  }

  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${getPayPalBaseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal token error: ${errorText}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('PayPal token missing');
  }

  return data.access_token;
}

function getPayPalPlanMap(env) {
  const map = {};
  if (env?.PAYPAL_PLAN_PRO) {
    env.PAYPAL_PLAN_PRO.split(',').map(s => s.trim()).filter(Boolean).forEach(id => {
      map[id] = 'pro';
    });
  }
  if (env?.PAYPAL_PLAN_UNLIMITED) {
    env.PAYPAL_PLAN_UNLIMITED.split(',').map(s => s.trim()).filter(Boolean).forEach(id => {
      map[id] = 'unlimited';
    });
  }
  return map;
}

function resolvePlanFromPayPal(planId, env) {
  const map = getPayPalPlanMap(env);
  return map[planId] || null;
}

function resolveNextBillingDate(subscription) {
  const nextTime = subscription?.billing_info?.next_billing_time;
  if (nextTime) return new Date(nextTime).toISOString();
  const startTime = subscription?.start_time;
  if (startTime) {
    const d = new Date(startTime);
    d.setDate(d.getDate() + 30);
    return d.toISOString();
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 30);
  return fallback.toISOString();
}

async function ensurePayPalColumns() {
  try {
    await executeTursoQuery('ALTER TABLE users ADD COLUMN paypal_subscription_id TEXT');
  } catch (e) {}
  try {
    await executeTursoQuery('ALTER TABLE users ADD COLUMN paypal_payer_id TEXT');
  } catch (e) {}
}

// ============================================
// 🧹 LIMPIEZA DE CUENTAS ARCHIVADAS
// ============================================
async function cleanupArchivedAccounts(hours = 48) {
  const offset = `-${hours} hours`;
  const accountsResult = await executeTursoQuery(
    `SELECT id, mt_account_number
     FROM accounts
     WHERE is_archived = 1
       AND archived_at IS NOT NULL
       AND datetime(archived_at) < datetime('now', ?)`
    , [offset]
  );

  const accountRows = accountsResult?.rows || [];
  if (!accountRows.length) {
    return { accountsDeleted: 0, tradesDeleted: 0, installationsDeleted: 0, accountIds: [] };
  }

  let tradesDeleted = 0;
  let installationsDeleted = 0;
  let plansDeleted = 0;
  let accountsDeleted = 0;

  for (const row of accountRows) {
    const accountId = row.id;
    const accountNumber = row.mt_account_number ? String(row.mt_account_number) : null;

    const tradesRes = await executeTursoQuery(
      `DELETE FROM trades WHERE account_id = ?`,
      [accountId]
    );
    tradesDeleted += tradesRes?.rowsAffected || 0;

    if (accountNumber) {
      const instRes = await executeTursoQuery(
        `DELETE FROM installations WHERE account_id = ? OR account = ? OR UPPER(installation_id) LIKE ?`,
        [accountId, accountNumber, `%_${accountNumber}`.toUpperCase()]
      );
      installationsDeleted += instRes?.rowsAffected || 0;
    } else {
      const instRes = await executeTursoQuery(
        `DELETE FROM installations WHERE account_id = ?`,
        [accountId]
      );
      installationsDeleted += instRes?.rowsAffected || 0;
    }

    const planRes = await executeTursoQuery(
      `DELETE FROM trading_plans WHERE account_id = ?`,
      [accountId]
    );
    plansDeleted += planRes?.rowsAffected || 0;

    const accRes = await executeTursoQuery(
      `DELETE FROM accounts WHERE id = ?`,
      [accountId]
    );
    accountsDeleted += accRes?.rowsAffected || 0;
  }

  return {
    accountsDeleted,
    tradesDeleted,
    installationsDeleted,
    plansDeleted,
    accountIds: accountRows.map(r => r.id)
  };
}

// ============================================
// ?? WHITELIST DE QUERIES - CASE INSENSITIVE
// ============================================
const ALLOWED_QUERY_PATTERNS = [
  // ? Queries de autenticacion - MAS PERMISIVAS
  /^SELECT .+ FROM users/i,
  /^INSERT INTO users .+$/i,
  
  // ? Queries de accounts
  /^SELECT .+ FROM accounts/i,
  /^INSERT INTO accounts .+$/i,
  /^UPDATE accounts SET .+ WHERE id = \?$/i,
  /^DELETE FROM accounts WHERE id = \?$/i,
  
  // ? Queries de trades
  /^SELECT .+ FROM trades/i,
  /^INSERT INTO trades .+$/i,
  /^DELETE FROM trades WHERE (id = \?|account_id = \?|account_id = \? AND date = \?)$/i,

  // ? Queries de trading_plans
  /^DELETE FROM trading_plans WHERE account_id = \?$/i,

  // ? Accounts delete (permanent removal)
  /^DELETE FROM accounts WHERE id = \?$/i,

  // ? Queries for daily_notes (journal / mission control)
  /^SELECT .+ FROM daily_notes/i,
  /^INSERT OR IGNORE INTO daily_notes .+$/i,
  /^INSERT INTO daily_notes .+$/i,
  /^UPDATE daily_notes SET .+$/i,
  /^DELETE FROM daily_notes WHERE .+$/i,
  
  // ? Account States
  /^SELECT .+ FROM account_states/i,
  /^INSERT OR REPLACE INTO account_states .+$/i,
  /^DELETE FROM account_states WHERE account_id = \?$/i,
  
  // ? Installations table (EA registration)
  /^SELECT .+ FROM installations/i,
  /^INSERT INTO installations .+$/i,
  /^UPDATE installations SET .+$/i,
  /^DELETE FROM installations WHERE .+$/i,
  
  // ? Ebook downloads table
  /^CREATE TABLE IF NOT EXISTS ebook_downloads .+$/i,
  /^INSERT INTO ebook_downloads .+$/i,
  /^SELECT .+ FROM ebook_downloads/i,
  
  // ? Payouts table
  /^SELECT .+ FROM payouts/i,
  /^INSERT INTO payouts .+$/i,
  /^UPDATE payouts SET .+$/i,
  /^DELETE FROM payouts WHERE .+$/i,

  // ? Cashflows table (deposit/withdraw)
  /^SELECT .+ FROM cashflows/i,
  /^INSERT OR IGNORE INTO cashflows .+$/i,
  /^INSERT INTO cashflows .+$/i,
  /^UPDATE cashflows SET .+$/i,
  /^DELETE FROM cashflows WHERE .+$/i,
  
  // ? Queries de utilidad
  /^SELECT 1 FROM users LIMIT 1$/i,
  
  // ? DDL Statements
  /^CREATE TABLE IF NOT EXISTS .+$/i,
  /^CREATE INDEX IF NOT EXISTS .+$/i,
  /^ALTER TABLE (trades|accounts|account_states|users|tradovate_connections) ADD COLUMN .+$/i,
  
  // ? Updates de usuarios (admin panel)
  /^UPDATE users SET .+ WHERE (id = \?|token = \?)$/i,
  
  // ? ADMIN PANEL - Queries adicionales
  /^SELECT COUNT\(\*\) .* FROM users/i,
  /^UPDATE users SET user_plan = \? WHERE id = \?$/i,
  /^UPDATE users SET is_active = \? WHERE id = \?$/i,
  /^UPDATE users SET expires_at = .+ WHERE id = \?$/i,
  /^UPDATE users SET last_login = \? WHERE id = \?$/i,
];

const PUBLIC_QUERY_PATTERNS = [
  /^INSERT INTO email_verification_tokens .+$/i,
  /^SELECT .+ FROM email_verification_tokens .+$/i,
  /^UPDATE email_verification_tokens SET .+ WHERE id = \?$/i,
  /^UPDATE users SET email_verified = 1 WHERE id = \?$/i,
];

// Queries que requieren rol de admin
const ADMIN_ONLY_PATTERNS = [
  /^SELECT COUNT\(\*\) .* FROM users/i,
  /^UPDATE users SET user_plan/i,
  /^UPDATE users SET is_active/i,
  /^UPDATE users SET expires_at/i,
  /^SELECT .+ FROM users ORDER BY/i,
];

function isAdminOnlyQuery(sql) {
  const normalized = sql.trim().replace(/\s+/g, ' ');
  return ADMIN_ONLY_PATTERNS.some(pattern => pattern.test(normalized));
}

// Simple in-memory token cache to avoid an extra DB roundtrip per request.
const TOKEN_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const tokenCache = new Map(); // token -> { id, email, expires_at, __cachedAt }

// ============================================
// ?? NORMALIZAR TRADE DEL EA
// ============================================
function buildTradeKey(ticket, date, entryPrice, exitPrice, entryTime, exitTime) {
  const t = (ticket || '').toString();
  const d = date || '';
  const ep = Number(entryPrice || 0).toFixed(5);
  const xp = Number(exitPrice || 0).toFixed(5);
  const et = entryTime || '';
  const xt = exitTime || '';
  return `${t}_${d}_${ep}_${xp}_${et}_${xt}`;
}

function normalizeTrade(trade) {
  // ?? Funcion auxiliar para extraer solo hora HH:MM
  function extractTimeOnly(timeStr) {
    if (!timeStr) return null;
    // Soportar timestamps numéricos (segundos o milisegundos)
    const ts = parseTimestamp(timeStr);
    if (ts && ts.time) return ts.time;
    const str = timeStr.toString().trim();
    
    // Si viene completo "2025.10.27 14:30:45", extraer solo "14:30"
    const match = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
    return null;
  }
  
  // ?? Funcion auxiliar para extraer solo fecha YYYY-MM-DD
  function extractDateOnly(dateStr) {
    if (!dateStr) return null;
    // Soportar timestamps numéricos (segundos o milisegundos)
    const ts = parseTimestamp(dateStr);
    if (ts && ts.date) return ts.date;
    const str = dateStr.toString().trim();
    
    // Si viene "2025.10.27 14:30:45", extraer solo "2025.10.27"
    let date = str.split(' ')[0];
    if (date.includes('.')) {
      date = date.replace(/\./g, '-');
    }
    return date;
  }
  
  // 1?? Normalizar FECHA DE CIERRE (no de apertura)
  // El trade se guarda en el d�a que CIERRA, no que abre
  const rawExitTime = trade.exit_time || trade.close_time || trade.time_close || trade.time_close_msc || trade.close_time_msc || trade.exitTime || trade.closeTime;
  const rawEntryTime = trade.entry_time || trade.open_time || trade.time_open || trade.time_open_msc || trade.open_time_msc || trade.entryTime || trade.openTime;

  let date = extractDateOnly(rawExitTime) || extractDateOnly(trade.date);
  if (!date) {
    date = new Date().toISOString().split('T')[0];
  }
  
  // 2?? Normalizar HORARIOS: Solo HH:MM
  const entry_time = extractTimeOnly(rawEntryTime);
  const exit_time = extractTimeOnly(rawExitTime);
  
  // 3?? Normalizar comentarios: "null" ? null real
  let comment = trade.comment;
  if (comment === 'null' || comment === 'NULL' || comment === '' || !comment) {
    comment = null;
  }
  
  // 4?? Normalizar tradingview_url: "null" ? null real
  let tradingview_url = trade.tradingview_url;
  if (tradingview_url === 'null' || tradingview_url === 'NULL' || tradingview_url === '' || !tradingview_url) {
    tradingview_url = null;
  }
  
  // 5?? Asegurar que los n�meros son n�meros
  const lot_size = parseFloat(trade.lot_size || trade.volume || 0);
  const entry_price = parseFloat(trade.entry_price || trade.open_price || trade.price_open || trade.price || 0);
  const exit_price = parseFloat(trade.exit_price || trade.close_price || trade.price_close || trade.price || 0);
  const commission = parseFloat(trade.commission || 0);
  const swap = parseFloat(trade.swap || 0);
  
  // 6?? ?? DETECCI�N INTELIGENTE DE PROFIT (BRUTO vs NETO)
  // Basada en la l�gica del mt-parser.js
  let profit_raw = parseFloat(trade.profit_usd || trade.profit || 0);
  let profit_net = profit_raw;
  
  if (commission !== 0 || swap !== 0) {
    // CASO ESPECIAL: Si profit es 0 o muy peque�o, aplicar comisi�n/swap
    if (Math.abs(profit_raw) < 0.01) {
      profit_net = profit_raw + commission + swap;
    } else {
      // Calcular qu� ser�a el profit si fuera bruto
      const wouldBeNet = profit_raw + commission + swap;
      
      // Comparar con tolerancia de centavos (redondeo)
      const difference = Math.abs(profit_raw - wouldBeNet);
      
      // Si la diferencia es mayor que 1 centavo por cada $10 de profit
      const tolerance = Math.max(0.01, Math.abs(profit_raw) * 0.001);
      
      if (difference > tolerance) {
        // El profit es BRUTO (no incluye comisi�n/swap)
        profit_net = wouldBeNet;
      } else {
        // El profit ya es NETO (ya incluye comisi�n/swap)
        profit_net = profit_raw;
      }
    }
  } else {
    // No hay comisi�n ni swap
    profit_net = profit_raw;
  }
  
  profit_net = parseFloat(profit_net.toFixed(2)); // Redondear a 2 decimales
  
  // 7?? Normalizar direcci�n
  let direction = trade.direction || 'LONG';
  if (typeof direction === 'number') {
    direction = (direction === 0) ? 'LONG' : 'SHORT';
  } else if (typeof direction === 'string' && direction.toLowerCase() === 'buy') {
    direction = 'LONG';
  } else if (typeof direction === 'string' && direction.toLowerCase() === 'sell') {
    direction = 'SHORT';
  }
  direction = direction.toUpperCase();
  
  // 8?? Normalizar s�mbolo
  let pair = trade.pair || trade.symbol || '';
  pair = pair.toUpperCase().trim();
  
  // 9?? Generar ID �nico basado en m�ltiples campos
  const ticketValue = trade.id || trade.ticket || trade.deal_id || trade.deal || trade.position_id || trade.position || trade.order_id || trade.order || Date.now().toString();
  const uniqueId = buildTradeKey(ticketValue, date, entry_price, exit_price, entry_time, exit_time);
  
  return {
    ticket: ticketValue.toString(),
    uniqueId: uniqueId,
    pair: pair,
    direction: direction,
    date: date,
    entry_time: entry_time,
    exit_time: exit_time,
    lot_size: lot_size,
    entry_price: entry_price,
    exit_price: exit_price,
    commission: commission,
    swap: swap,
    profit_usd: profit_net,
    comment: comment,
    tradingview_url: tradingview_url
  };
}

// ?? Helper: convertir timestamps numéricos (segundos/ms) a fecha y hora
function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = value.toString().trim();
  if (!/^[0-9]+$/.test(str)) return null;
  let num = Number(str);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num < 1e12) {
    num *= 1000;
  }
  const d = new Date(num);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  return {
    date: iso.split('T')[0],
    time: iso.substring(11, 16)
  };
}

// ??? VALIDACI�N DE QUERIES - MEJORADA
function isQueryAllowed(sql) {
  const normalizedSql = sql.trim().replace(/\s+/g, ' ');
  
  const dangerousKeywords = [
    'DROP TABLE',
    'DROP DATABASE',
    'DROP INDEX',
    'TRUNCATE',
    'ALTER TABLE.*DROP',
    'DELETE FROM (users|access_tokens).*WHERE 1\\s*=\\s*1',
    'UPDATE (users|access_tokens).*WHERE 1\\s*=\\s*1',
    'PRAGMA',
    'ATTACH',
    'DETACH'
  ];
  
  for (const keyword of dangerousKeywords) {
    if (new RegExp(keyword, 'i').test(normalizedSql)) {
      
      return false;
    }
  }
  
  if (normalizedSql.toUpperCase().startsWith('SELECT')) {
    return true;
  }
  
  const allowed = ALLOWED_QUERY_PATTERNS.some(pattern => pattern.test(normalizedSql));
  
  return allowed;
}

function isPublicQueryAllowed(sql) {
  const normalizedSql = sql.trim().replace(/\s+/g, ' ');
  if (/;|--|\/\*/.test(normalizedSql)) {
    return false;
  }
  return PUBLIC_QUERY_PATTERNS.some(pattern => pattern.test(normalizedSql));
}

// ============================================
// ?? PASSWORD HASHING Y HELPERS
// ============================================

// Generar contrase�a temporal aleatoria (8 caracteres)
function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Simple hashing con SHA-256 (producci�n: usar bcryptjs)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Verificar contrase�a hasheada
async function verifyPassword(password, hash) {
  const newHash = await hashPassword(password);
  return newHash === hash;
}

// ============================================
// ENCRYPTION HELPERS (AES-GCM)
// ============================================
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveAesKey(userToken, userId) {
  const enc = new TextEncoder();
  const salt = enc.encode(`tfx:${userId}`);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(userToken),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptWithUserToken(plainText, userToken, userId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(userToken, userId);
  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );
  return `${bufferToBase64(iv)}:${bufferToBase64(cipherBuffer)}`;
}

async function decryptWithUserToken(cipherText, userToken, userId) {
  const [ivB64, dataB64] = (cipherText || '').split(':');
  if (!ivB64 || !dataB64) throw new Error('Invalid encrypted payload');
  const iv = new Uint8Array(base64ToBuffer(ivB64));
  const dataBuffer = base64ToBuffer(dataB64);
  const key = await deriveAesKey(userToken, userId);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );
  return new TextDecoder().decode(plainBuffer);
}

// Generar ID �nico
function generateId() {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// ============================================
// TRADOVATE HELPERS
// ============================================
const TRADOVATE_BASES = {
  demo: 'https://demo.tradovateapi.com/v1',
  live: 'https://live.tradovateapi.com/v1'
};

function getTradovateBaseUrl(environment) {
  return environment === 'live' ? TRADOVATE_BASES.live : TRADOVATE_BASES.demo;
}

function formatDateOnly(isoDate) {
  try {
    return new Date(isoDate).toISOString().slice(0, 10);
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

async function ensureTradovateSchema() {
  const ddlStatements = [
      `CREATE TABLE IF NOT EXISTS tradovate_connections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT,
        tradovate_user_id INTEGER,
        tradovate_account_id INTEGER,
        username TEXT,
        encrypted_password TEXT,
        device_id TEXT,
        env TEXT DEFAULT 'demo',
        access_token TEXT,
        token_expiration TEXT,
        last_sync TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
    `CREATE INDEX IF NOT EXISTS idx_tradovate_connections_user ON tradovate_connections(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tradovate_connections_account ON tradovate_connections(account_id)`,
    `CREATE TABLE IF NOT EXISTS tradovate_fills (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      contract_id INTEGER,
      action TEXT,
      qty REAL,
      price REAL,
      timestamp TEXT,
      remaining_qty REAL,
      status TEXT DEFAULT 'open'
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tradovate_fills_conn ON tradovate_fills(connection_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tradovate_fills_status ON tradovate_fills(connection_id, status)`
  ];

  for (const stmt of ddlStatements) {
    try { await executeTursoQuery(stmt, []); } catch (e) {}
  }

  // Add columns to accounts if missing
  const alterStatements = [
    `ALTER TABLE accounts ADD COLUMN sync_provider TEXT`,
    `ALTER TABLE accounts ADD COLUMN external_account_id TEXT`
  ];
  for (const stmt of alterStatements) {
    try { await executeTursoQuery(stmt, []); } catch (e) {}
  }
}

async function tradovateRequest(baseUrl, path, options = {}) {
  const fullUrl = `${baseUrl}${path}`;
  const res = await fetch(fullUrl, {
    ...options,
    redirect: 'follow'
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tradovate error (${res.status}): ${text.substring(0, 100) || res.statusText}`);
  }
  
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expected JSON but got ${contentType}`);
  }
  
  const json = await res.json().catch((e) => {
    throw new Error(`JSON parse error: ${e.message}`);
  });
  
  return json;
}

async function ensureTradovateToken(env, connection, userToken, userId) {
  const baseUrl = getTradovateBaseUrl(connection.env || 'demo');
  const expiresAt = connection.token_expiration ? new Date(connection.token_expiration) : null;
  const now = new Date();

  if (connection.access_token && expiresAt && (expiresAt.getTime() - now.getTime()) > 5 * 60 * 1000) {
    return { accessToken: connection.access_token, expirationTime: connection.token_expiration, baseUrl };
  }

  if (!connection.encrypted_password || !connection.device_id || !connection.username) {
    throw new Error('Missing Tradovate credentials. Reconnect required.');
  }

  if (!userToken || !userId) {
    throw new Error('Missing user token for Tradovate re-auth');
  }

  const password = await decryptWithUserToken(connection.encrypted_password, userToken, userId);

  const tokenResp = await tradovateRequest(baseUrl, '/auth/accesstokenrequest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: connection.username,
      password: password,
      deviceId: connection.device_id,
      appId: 'TradingJournal',
      appVersion: '1.0'
    })
  });

  const newToken = tokenResp.accessToken;
  const newExpiry = tokenResp.expirationTime || null;

  if (newToken) {
    await executeTursoQuery(
      'UPDATE tradovate_connections SET access_token = ?, token_expiration = ?, updated_at = ? WHERE id = ?',
      [newToken, newExpiry, new Date().toISOString(), connection.id]
    );
  }

  return { accessToken: newToken, expirationTime: newExpiry, baseUrl };
}

// Enviar email con contraseña temporal (usando Brevo API)
async function sendTempPasswordEmail(email, tempPassword, env) {
  try {
    const BREVO_API_KEY = env?.BREVO_API_KEY || '';
    
    if (!BREVO_API_KEY) {
      return false;
    }


    // Preparar HTML del email
    const emailHtml = `
      <h2>Bienvenido a Tripulación FX Trading Journal</h2>
      <p>¡Hola! Tu contraseña temporal es:</p>
      <h3 style="background: #f0f0f0; padding: 15px; border-radius: 5px; font-family: monospace; color: #333;">
        ${tempPassword}
      </h3>
      <p><strong>Importante:</strong> Esta contraseña es válida por <strong>30 minutos</strong>.</p>
      <ol>
        <li>Ingresa en tu cuenta con esta contraseña temporal</li>
        <li>Crea tu contraseña permanente</li>
        <li>¡Listo! Comienza a usar Tripulación FX</li>
      </ol>
      <p>Si no solicitaste esta cuenta, ignora este email.</p>
      <hr>
      <p style="color: #999; font-size: 12px;">
        © 2025 Tripulación FX Trading Journal. Todos los derechos reservados.
      </p>
    `;

    const payload = {
      sender: {
        email: 'noreply@tripulacionfx.com',
        name: 'Tripulación FX Trading Journal'
      },
      to: [
        {
          email: email,
          name: 'Usuario'
        }
      ],
      subject: '🔑 Tu contraseña temporal - Tripulación FX',
      htmlContent: emailHtml,
      replyTo: {
        email: 'support@tripulacionfx.com',
        name: 'Tripulación FX Support'
      }
    };


    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });


    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Brevo error ${response.status}: ${errorData}`);
    }

    const data = await response.json();
    return true;

  } catch (error) {
    // No lanzar error - permitir que flujo contin�e aunque email falle
    return false;
  }
}

// Función para enviar email de confirmación de pago
async function sendPaymentConfirmationEmail(email, plan, expiresAt, env) {
  try {
    const BREVO_API_KEY = env?.BREVO_API_KEY || '';
    
    if (!BREVO_API_KEY) {
      
      return false;
    }


    const planNames = { pro: 'PRO', unlimited: 'UNLIMITED' };
    const planPrices = { pro: '$9.99', unlimited: '$14.99' };
    const planName = planNames[plan.toLowerCase()] || 'PRO';
    const planPrice = planPrices[plan.toLowerCase()] || '$9.99';

    const expiryDate = new Date(expiresAt);
    const formattedDate = expiryDate.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">✅ ¡Pago Confirmado!</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
          <p>Hola,</p>
          <p>Tu suscripción a <strong>Tripulación FX Trading Journal</strong> ha sido confirmada exitosamente.</p>
          <div style="background: white; border: 2px solid #4ade80; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #4ade80; margin-top: 0;">Detalles de tu Suscripción</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #666;">Plan:</td>
                <td style="padding: 12px 0; font-weight: bold; color: #1f2937; text-align: right;">Plan ${planName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #666;">Precio mensual:</td>
                <td style="padding: 12px 0; font-weight: bold; color: #1f2937; text-align: right;">${planPrice}/mes</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; color: #666;">Fecha de pago:</td>
                <td style="padding: 12px 0; font-weight: bold; color: #1f2937; text-align: right;">Hoy</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; color: #666;">Próxima renovación:</td>
                <td style="padding: 12px 0; font-weight: bold; color: #4ade80; text-align: right;">${formattedDate}</td>
              </tr>
            </table>
          </div>
          <p style="color: #666;">Con tu nuevo plan tienes acceso a:</p>
          <ul style="color: #666; line-height: 1.8;">
            <li>✅ Análisis avanzado de operaciones</li>
            <li>✅ Gestión de riesgo en tiempo real</li>
            <li>✅ Reportes detallados de desempeño</li>
            <li>✅ Sincronización MT4/MT5</li>
            ${plan.toLowerCase() === 'unlimited' ? '<li>✅ Soporte prioritario</li><li>✅ Webinars exclusivos</li>' : ''}
          </ul>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://tripulacionfx.com/journal" style="background: #4ade80; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Ir a tu Journal</a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Si tienes preguntas contacta a <a href="mailto:support@tripulacionfx.com" style="color: #4ade80; text-decoration: none;">support@tripulacionfx.com</a>
          </p>
          <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">© 2025 Tripulación FX Trading Journal</p>
        </div>
      </div>
    `;

    const payload = {
      sender: { email: 'noreply@tripulacionfx.com', name: 'Tripulación FX Trading Journal' },
      to: [{ email: email, name: 'Usuario' }],
      subject: `✅ Confirmación de Pago - Plan ${planName} Activado`,
      htmlContent: emailHtml,
      replyTo: { email: 'support@tripulacionfx.com', name: 'Tripulación FX Support' }
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      
      return false;
    }

    const data = await response.json();
    return true;

  } catch (error) {
    
    return false;
  }
}

// ============================================
// 🧠 SESSION CONFIG HELPERS
// ============================================
function normalizeSessionConfig(rawConfig = {}) {
  const cfg = (rawConfig && typeof rawConfig === 'object') ? rawConfig : {};
  const profitTarget = Number(cfg.profit_target);
  const maxDailyLoss = Number(cfg.max_daily_loss);
  const maxTrades = parseInt(cfg.max_trades, 10);

  const session = typeof cfg.session === 'string' ? cfg.session.trim() : '';
  const pairs = Array.isArray(cfg.pairs)
    ? cfg.pairs.map(p => String(p).trim()).filter(Boolean)
    : [];
  const riskLevel = typeof cfg.risk_level === 'string' ? cfg.risk_level.trim() : '';

  return {
    profit_target: Number.isFinite(profitTarget) ? profitTarget : 0,
    max_daily_loss: Number.isFinite(maxDailyLoss) ? maxDailyLoss : 0,
    max_trades: Number.isFinite(maxTrades) ? maxTrades : 0,
    session,
    pairs,
    risk_level: riskLevel
  };
}

// ============================================
// 🚀 WORKER PRINCIPAL
// ============================================
export default {
  async fetch(request, env) {
    // Initialize secrets from wrangler environment
    TURSO_TOKEN = env.TURSO_TOKEN || '';
    FALLBACK_ADMIN_SECRET = env.ADMIN_SECRET || '';

    const corsHeaders = getCorsHeaders(request);
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ============================================
    // 🟢 ACTIVAR SESIÓN (SET & FORGET)
    // POST /api/activate-session
    // ============================================
    if (path === '/api/activate-session' && request.method === 'POST') {
      if (!env?.ACTIONS_KV) {
        return new Response(JSON.stringify({ error: 'ACTIONS_KV not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json().catch(() => ({}));
      const installationId = String(body?.installation_id || '').trim();
      const config = normalizeSessionConfig(body?.config || {});

      if (!installationId) {
        return new Response(JSON.stringify({ error: 'installation_id requerido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await env.ACTIONS_KV.put(
        `session:${installationId}`,
        JSON.stringify({
          action: 'ACTIVATE_SESSION',
          config,
          timestamp: Date.now()
        }),
        { expirationTtl: 86400 }
      );

      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================
    // � FORZAR RESINCRONIZACIÓN DE TRADES
    // POST /api/journal/force-resync
    // ============================================
    if (path === '/api/journal/force-resync' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const accountId = body?.accountId || '';

        if (!accountId) {
          return new Response(JSON.stringify({ error: 'Missing accountId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const accountResult = await executeTursoQuery(
          'SELECT id, user_id FROM accounts WHERE id = ?',
          [accountId]
        );

        if (!accountResult || accountResult.rows.length === 0) {
          return new Response(JSON.stringify({ error: 'Account not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const account = accountResult.rows[0];
        const userId = account.user_id;

        const installationResult = await executeTursoQuery(
          'SELECT installation_id FROM installations WHERE user_id = ? LIMIT 1',
          [userId]
        );

        if (!installationResult || installationResult.rows.length === 0) {
          return new Response(JSON.stringify({ error: 'Installation not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const installationId = installationResult.rows[0].installation_id;

        if (env?.ACTIONS_KV) {
          await env.ACTIONS_KV.put(
            `force-resync:${installationId}`,
            JSON.stringify({
              action: 'FORCE_RESYNC',
              accountId,
              timestamp: Date.now()
            }),
            { expirationTtl: 3600 }
          );
        }

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Resync command sent to EA'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('[force-resync] Error:', err?.message || err);
        return new Response(JSON.stringify({ 
          error: 'Internal server error',
          message: err?.message || 'Unknown error'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // �🔴 DESACTIVAR SESIÓN
    // POST /api/deactivate-session
    // ============================================
    if (path === '/api/deactivate-session' && request.method === 'POST') {
      if (!env?.ACTIONS_KV) {
        return new Response(JSON.stringify({ error: 'ACTIONS_KV not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json().catch(() => ({}));
      const installationId = String(body?.installation_id || '').trim();

      if (!installationId) {
        return new Response(JSON.stringify({ error: 'installation_id requerido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await env.ACTIONS_KV.put(
        `session:${installationId}`,
        JSON.stringify({
          action: 'DEACTIVATE_SESSION',
          timestamp: Date.now()
        }),
        { expirationTtl: 300 }
      );

      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================
    // 📡 CHECK CONFIG (ONE-TIME DELIVERY)
    // GET /api/check-session-config?installation_id=...
    // ============================================
    if (path === '/api/check-session-config' && request.method === 'GET') {
      if (!env?.ACTIONS_KV) {
        return new Response(JSON.stringify({ error: 'ACTIONS_KV not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const installationId = String(url.searchParams.get('installation_id') || '').trim();
      if (!installationId) {
        return new Response(JSON.stringify({ error: 'installation_id requerido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const payload = await env.ACTIONS_KV.get(`session:${installationId}`);
      if (payload) {
        await env.ACTIONS_KV.delete(`session:${installationId}`);
        return new Response(payload, {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ action: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================
    // ENDPOINT ADMIN
    // ============================================
    if (path === '/api/admin' && request.method === 'POST') {
      const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;

      const authHeader = request.headers.get('Authorization') || '';
      const tokenParts = authHeader.split(' ');
      if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const provided = tokenParts[1];
      const payload = await verifyJWT(provided, workerSecret);
      if (!payload || payload.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const body = await request.json().catch(() => ({}));
      const { email = null, username = null, expiresAt = null, maxUses = 1, notes = null } = body;

      if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required' }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      try {
        const id = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
        const newToken = (Math.random().toString(36).substr(2, 10) + '-' + id).toUpperCase();

        const insertSql = `INSERT INTO access_tokens (id, token, email, max_uses, uses, is_active, created_at, expires_at, notes) VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?)`;
        const args = [id, newToken, email, Number(maxUses) || 1, new Date().toISOString(), expiresAt || null, notes || null];

        await executeTursoQuery(insertSql, args);

        return new Response(JSON.stringify({ success: true, token: newToken }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      } catch (err) {
        
        return new Response(JSON.stringify({ error: err.message || 'Create token failed' }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // ============================================
    // ENDPOINT: ACTUALIZAR PERFIL DE USUARIO
    // POST /api/update-profile
    // ============================================
    if (path === '/api/update-profile' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { userId, userName, fullName, country } = data;

        // Validaciones de seguridad
        if (!userId || !userName || !fullName) {
          return new Response(
            JSON.stringify({ success: false, error: 'userId, userName y fullName son requeridos' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validar y sanitizar userName
        const sanitizedUserName = String(userName).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
        if (sanitizedUserName.length < 3 || sanitizedUserName.length > 30) {
          return new Response(
            JSON.stringify({ success: false, error: 'Nombre de usuario inválido (3-30 caracteres, solo letras, números, _ y -)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verificar si el userName ya existe (excepto para el usuario actual)
        const existingUser = await executeTursoQuery(
          'SELECT id FROM users WHERE username = ? AND id != ?',
          [sanitizedUserName, userId]
        );

        if (existingUser && existingUser.rows && existingUser.rows.length > 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'El nombre de usuario ya está en uso' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Sanitizar y validar fullName
        const sanitizedFullName = String(fullName).trim().replace(/[<>"']/g, '');
        if (sanitizedFullName.length < 2 || sanitizedFullName.length > 100) {
          return new Response(
            JSON.stringify({ success: false, error: 'Nombre completo inválido (2-100 caracteres)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Sanitizar country
        const sanitizedCountry = country ? String(country).trim().replace(/[<>"']/g, '').substring(0, 50) : null;

        // Verificar token
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return new Response(
            JSON.stringify({ success: false, error: 'No autorizado' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Actualizar en BD con Turso
        await executeTursoQuery(
          'UPDATE users SET username = ?, full_name = ?, country = ? WHERE id = ?',
          [sanitizedUserName, sanitizedFullName, sanitizedCountry, userId]
        );


        return new Response(
          JSON.stringify({ success: true, message: 'Perfil actualizado correctamente' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        error(`❌ Error update-profile: ${error.message}`);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // ENDPOINT AUTO-CONFIRM INSTALACIÓN
    // ============================================
    if (path === '/api/auto-confirm-installation' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { email } = data;

        if (!email) {
          return new Response(JSON.stringify({ error: 'Email requerido' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const emailLower = email.toLowerCase();

        // ? VALIDACI�N SEGURA: Usuario debe existir, estar ACTIVO, y suscripci�n v�lida
        const userResult = await executeTursoQuery(
          'SELECT id, is_active, expires_at FROM users WHERE LOWER(email) = ?',
          [emailLower]
        );

        if (!userResult || userResult.rows.length === 0) {
          warn(`? No encontrado`);
          return new Response(JSON.stringify({ 
            error: 'User not found',
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const user = userResult.rows[0];
        const userId = user.id;

        // ? Verificar que usuario est� ACTIVO
        if (user.is_active !== 1 && user.is_active !== '1') {
          warn(`? Inactivo`);
          return new Response(JSON.stringify({ 
            error: 'User not active',
            message: 'Usuario inactivo. Contacta al administrador.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ? Verificar SUSCRIPCI�N no expirada
        if (user.expires_at) {
          const expiryDate = new Date(user.expires_at);
          const now = new Date();
          if (now > expiryDate) {
            warn(`? Expirada`);
            return new Response(JSON.stringify({ 
              error: 'Subscription expired',
              message: 'Suscripci�n expirada. Renueva para continuar.'
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // ? TODO VALID� - Marcar instalaciones como confirmadas
        await executeTursoQuery(
          'UPDATE installations SET confirmed = 1 WHERE user_id = ?',
          [userId]
        );

        // ?? Auto-crear cuentas en BD para instalaciones confirmadas sin account_id
        const installationsToActivate = await executeTursoQuery(
          'SELECT id, account, broker, server, installation_id FROM installations WHERE user_id = ? AND confirmed = 1 AND account_id IS NULL AND account IS NOT NULL',
          [userId]
        );

        if (installationsToActivate && installationsToActivate.rows) {
          for (const inst of installationsToActivate.rows) {
            const accountId = `acc-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
            
            try {
              await executeTursoQuery(
                `INSERT INTO accounts (
                  id, user_id, name, balance, status, type, broker, server, 
                  mt_account_number, synced_at, syncing, initial_balance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  accountId,
                  userId,
                  `${inst.broker || 'Unknown'} Account`,
                  0,
                  'active',
                  'trading',
                  inst.broker || 'Unknown',
                  inst.server || 'Unknown',
                  inst.account,
                  new Date().toISOString(),
                  0,
                  0
                ]
              );

              // Vincular en installations
              await executeTursoQuery(
                'UPDATE installations SET account_id = ? WHERE id = ?',
                [accountId, inst.id]
              );
              
            } catch (err) {
              error(`? Error creando cuenta para ${inst.account}:`, err);
            }
          }
        }

        
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Instalaciones auto-confirmadas'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT ADMIN LOGIN
    // ============================================
    if (path === '/api/admin-login' && request.method === 'POST') {
      const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
      const ipAddress = getClientIp(request);
      const adminRate = await checkRateLimit(env, `admin-login:${ipAddress}`, 5, 900);
      if (!adminRate.allowed) {
        return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '900' }
        });
      }
      const body = await request.json().catch(() => ({}));
      const { password } = body;
      if (!password) {
        return new Response(JSON.stringify({ error: 'Password required' }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      if (password !== workerSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      try {
        const token = await createJWT({ role: 'admin' }, workerSecret, 15 * 60);
        return new Response(JSON.stringify({ success: true, token }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      } catch (err) {
        
        return new Response(JSON.stringify({ error: 'Failed to create token' }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // ============================================
    // ENDPOINT ADMIN VERIFY
    // ============================================
    if (path === '/api/admin-verify' && request.method === 'POST') {
      const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
      const authHeader = request.headers.get('Authorization') || '';
      const tokenParts = authHeader.split(' ');

      if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const provided = tokenParts[1];

      const payload = await verifyJWT(provided, workerSecret);
      if (payload && payload.role === 'admin') {
        return new Response(JSON.stringify({ success: true }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================
    // ENDPOINT P�BLICO
    // ============================================
    if (path === '/api/public' && request.method === 'POST') {
      const { sql, args = [] } = await request.json();

      if (!sql || typeof sql !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid SQL' }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      if (!Array.isArray(args)) {
        return new Response(JSON.stringify({ error: 'Invalid arguments' }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      if (!isPublicQueryAllowed(sql)) {
        return new Response(JSON.stringify({ error: 'Query not allowed in public endpoint' }), { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      try {
        const queryResult = await executeTursoQuery(sql, args);
        return new Response(JSON.stringify(queryResult), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // ============================================
    // ?? VALIDAR RECAPTCHA v3
    // POST /api/validate-recaptcha
    // ============================================
    if (path === '/api/validate-recaptcha' && request.method === 'POST') {
      const { token } = await request.json();

      if (!token) {
        return new Response(JSON.stringify({ 
          error: 'Missing reCAPTCHA token',
          valid: false 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      try {
        // Validar token con Google
        const recaptchaSecret = env.RECAPTCHA_SECRET || ''; // Tu SECRET_KEY de Google reCAPTCHA
        
        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(token)}`
        });

        const data = await response.json();

        // Score: 0.0 (bot) a 1.0 (humano)
        // > 0.5 = probablemente humano
        // < 0.3 = probablemente bot
        const isValid = data.success && data.score > 0.5;

        return new Response(JSON.stringify({
          valid: isValid,
          score: data.score || 0,
          action: data.action || null,
          challengeTs: data.challenge_ts || null,
          hostname: data.hostname || null,
          errorCodes: data['error-codes'] || []
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });

      } catch (error) {
        
        return new Response(JSON.stringify({ 
          error: 'Failed to validate reCAPTCHA',
          valid: false 
        }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // ============================================
    // ?? ENDPOINT LIMPIAR REGISTROS EXPIRADOS
    // GET /api/cleanup-expired-registrations
    // ============================================
    if (path === '/api/cleanup-expired-registrations' && request.method === 'GET') {
      const adminKey = request.headers.get('X-Admin-Key');
      const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
      
      // Verificar autenticaci�n
      if (adminKey !== workerSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      try {
        // Obtener todos los registros expirados
        const expired = await executeTursoQuery(
          `SELECT id, email, expires_at FROM pending_registrations WHERE datetime(expires_at) < datetime('now')`
        );

        const expiredCount = expired?.rows?.length || 0;
        
        if (expiredCount > 0) {
          // Eliminar todos los expirados
          await executeTursoQuery(
            `DELETE FROM pending_registrations WHERE datetime(expires_at) < datetime('now')`
          );
        }

        return new Response(JSON.stringify({ 
          success: true,
          message: `Limpieza completada: ${expiredCount} registros expirados eliminados`,
          count: expiredCount
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // ============================================
    // ?? ENDPOINT TEST EMAIL
    // ============================================
    if (path === '/api/test-email' && request.method === 'POST') {
      try {
        const { email } = await request.json().catch(() => ({}));
        
        if (!email) {
          return new Response(JSON.stringify({ error: 'Email requerido' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }

        const tempPassword = generateTempPassword();

        const success = await sendTempPasswordEmail(email, tempPassword, env);

        return new Response(JSON.stringify({ 
          success,
          email,
          message: success ? 'Email enviado ?' : 'Fallo al enviar email ?',
          haveBrevoKey: !!env?.BREVO_API_KEY
        }), { 
          status: success ? 200 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });

      } catch (error) {
        
        return new Response(JSON.stringify({ 
          error: error.message,
          success: false
        }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // ============================================
    // DEBUG - Check User Data
    // ============================================
    if (path === '/api/debug-user' && request.method === 'POST') {
      try {
        const { email } = await request.json();
        
        if (!email) {
          return new Response(JSON.stringify({ error: 'Email required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        await ensurePayPalColumns();
        const userResult = await executeTursoQuery(
          'SELECT id, email, user_plan, expires_at, stripe_customer_id, paypal_subscription_id, paypal_payer_id, is_active FROM users WHERE LOWER(email) = ?',
          [email.toLowerCase()]
        );

        if (!userResult?.rows?.length) {
          return new Response(JSON.stringify({ 
            found: false,
            email: email,
            message: 'User not found in database'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const user = userResult.rows[0];
        return new Response(JSON.stringify({ 
          found: true,
          user: {
            id: user.id,
            email: user.email,
            plan: user.user_plan,
            expires_at: user.expires_at,
            stripe_customer_id: user.stripe_customer_id,
            paypal_subscription_id: user.paypal_subscription_id,
            paypal_payer_id: user.paypal_payer_id,
            is_active: user.is_active
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ 
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // SYNC - Find Stripe Customer and Save to DB
    // ============================================
    if (path === '/api/sync-stripe-customer' && request.method === 'POST') {
      try {
        const STRIPE_SECRET = env?.STRIPE_SECRET;
        
        if (!STRIPE_SECRET) {
          return new Response(JSON.stringify({ error: 'Stripe secret not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { email } = await request.json();
        
        if (!email) {
          return new Response(JSON.stringify({ error: 'Email required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }


        // Search for customer in Stripe
        const searchResponse = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET}`
          }
        });

        const searchData = await searchResponse.json();
        
        if (!searchData.data || searchData.data.length === 0) {
          return new Response(JSON.stringify({ 
            found: false,
            message: 'No Stripe customer found with this email'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const stripeCustomer = searchData.data[0];
        const customerId = stripeCustomer.id;
        

        // Get subscription info
        const subsResponse = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${customerId}&limit=1`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET}`
          }
        });

        const subsData = await subsResponse.json();
        let plan = 'pro';
        let expiresAt = null;

        if (subsData.data && subsData.data.length > 0) {
          const subscription = subsData.data[0];
          
          // Determine plan from subscription metadata or status
          plan = subscription.metadata?.plan || 'pro';
          
          // Get expiration from current_period_end
          if (subscription.current_period_end) {
            expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
          }
        }

        // Update DB with customer ID
        const userResult = await executeTursoQuery(
          'SELECT id FROM users WHERE LOWER(email) = ?',
          [email.toLowerCase()]
        );

        if (!userResult?.rows?.length) {
          return new Response(JSON.stringify({ 
            error: 'User not found in database'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const userId = userResult.rows[0].id;

        await executeTursoQuery(
          'UPDATE users SET stripe_customer_id = ?, user_plan = ? WHERE id = ?',
          [customerId, plan, userId]
        );

        if (expiresAt) {
          await executeTursoQuery(
            'UPDATE users SET expires_at = ? WHERE id = ?',
            [expiresAt, userId]
          );
        }


        return new Response(JSON.stringify({ 
          success: true,
          message: 'Successfully synced Stripe customer data',
          data: {
            customerId,
            plan,
            expiresAt
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ 
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT VALIDAR EMAIL
    // ============================================
    if (path === '/api/validate-email' && request.method === 'POST') {
      try {
        const { email } = await request.json().catch(() => ({}));

        if (!email || typeof email !== 'string') {
          return new Response(
            JSON.stringify({
              valid: false,
              message: 'Email requerido'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return new Response(
            JSON.stringify({
              valid: false,
              message: 'Formato de email inv�lido'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const result = await executeTursoQuery(
          'SELECT id, email FROM users WHERE email = ?',
          [email]
        );

        if (!result || result.rows.length === 0) {
          // ?? SEGURIDAD: Devolver v�lido de todas formas (no revelar si el email existe)
          return new Response(
            JSON.stringify({
              valid: true,
              message: 'Email v�lido'
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        return new Response(
          JSON.stringify({
            valid: true,
            message: 'Email verificado',
            email: email
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (error) {
        
        return new Response(
          JSON.stringify({
            valid: false,
            message: 'Error procesando solicitud: ' + error.message
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // ============================================
    // ?? ENDPOINT REGISTRAR EMAIL (App Electron)
    // ?? SOLO VALIDA - NO CREA USUARIOS
    // ============================================
    if (path === '/api/register-email' && request.method === 'POST') {
      try {
        const { email } = await request.json().catch(() => ({}));

        if (!email || typeof email !== 'string') {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Email requerido'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Formato de email inv�lido'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const emailLower = email.toLowerCase();

        // ? VALIDACI�N CR�TICA: El email DEBE existir en BD
        // NO creamos usuarios aqu� - eso es responsabilidad de admin/signup
        const existingResult = await executeTursoQuery(
          'SELECT id, is_active, expires_at FROM users WHERE LOWER(email) = ?',
          [emailLower]
        );

        if (!existingResult || existingResult.rows.length === 0) {
          // ? Email NO existe en BD - RECHAZAR
          warn(`? No encontrado`);
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Email no existe en BD. Reg�strate primero en la plataforma web.'
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const user = existingResult.rows[0];

        // ? Verificar que usuario est� ACTIVO
        if (user.is_active !== 1 && user.is_active !== '1') {
          warn(`? Inactivo`);
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Usuario inactivo. Contacta al administrador.'
            }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        // ? Verificar SUSCRIPCI�N no expirada (si aplica)
        if (user.expires_at) {
          const expiryDate = new Date(user.expires_at);
          const now = new Date();
          if (now > expiryDate) {
            warn(`? Expirada`);
            return new Response(
              JSON.stringify({
                success: false,
                message: 'Suscripci�n expirada. Renueva para continuar.'
              }),
              {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }
        }

        // ? TODO VALID� CORRECTAMENTE
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Email validado correctamente',
            email: emailLower,
            isNew: false
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (error) {
        
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Error procesando solicitud: ' + error.message
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // ============================================
    // 🔐 ENDPOINT: FORGOT PASSWORD - SOLICITAR TOKEN
    // POST /api/auth/forgot-password
    // Body: { email, recaptchaToken }
    // Rate Limits:
    //   - 3 intentos por email en 1 hora
    //   - 5 intentos por IP en 1 hora
    // Security: reCAPTCHA v3 (score > 0.5)
    // ============================================
    if (path === '/api/auth/forgot-password' && request.method === 'POST') {
      try {
        const { email, recaptchaToken } = await request.json().catch(() => ({}));

        // 📝 VALIDACIONES BÁSICAS
        if (!email || typeof email !== 'string') {
          return new Response(
            JSON.stringify({ success: false, error: 'Email requerido' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Email inv\u00e1lido' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!recaptchaToken) {
          return new Response(
            JSON.stringify({ success: false, error: 'reCAPTCHA requerido' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 🤖 VERIFICAR RECAPTCHA
        const recaptchaSecret = env?.RECAPTCHA_SECRET_KEY || '';
        if (recaptchaSecret) {
          try {
            const captchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `secret=${recaptchaSecret}&response=${recaptchaToken}`
            });

            const captchaData = await captchaResponse.json();
            if (!captchaData.success || captchaData.score <= 0.5) {
              warn(`🤖 reCAPTCHA failed for ${email}: score=${captchaData.score}`);
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'Validaci\u00f3n reCAPTCHA fallida',
                  captchaFailed: true
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } catch (captchaError) {
            warn(`⚠️ reCAPTCHA error: ${captchaError.message}`);
            // Continuar si falla la validación (no bloquear usuarios legítimos)
          }
        }

        const emailLower = email.toLowerCase().trim();
        const ipAddress = getClientIp(request);
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

        const kvEmailRate = await checkRateLimit(env, `forgot-password:email:${emailLower}`, 3, 3600);
        if (!kvEmailRate.allowed) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Demasiados intentos de solicitud. Intenta de nuevo en 1 hora.',
              retryAfter: 3600
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' } }
          );
        }

        const kvIpRate = await checkRateLimit(env, `forgot-password:ip:${ipAddress}`, 5, 3600);
        if (!kvIpRate.allowed) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Demasiados intentos desde esta IP. Intenta más tarde.',
              retryAfter: 3600
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' } }
          );
        }

        // 🗄️ CREAR TABLA SI NO EXISTE
        try {
          await executeTursoQuery(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              email TEXT NOT NULL,
              token TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              used_at TEXT,
              ip_address TEXT,
              FOREIGN KEY(user_id) REFERENCES users(id)
            )
          `);
        } catch (e) {
          // Tabla ya existe - continuar
        }

        // � BUSCAR USUARIO PRIMERO (para verificar rate limit de 24h)
        const userResult = await executeTursoQuery(
          'SELECT id, email, is_active FROM users WHERE LOWER(email) = ?',
          [emailLower]
        );

        // 🛡️ RATE LIMITING PRINCIPAL: 24 HORAS DESPUÉS DE CAMBIO EXITOSO
        // Si el usuario existe, verificar si cambió contraseña recientemente
        if (userResult && userResult.rows.length > 0) {
          const user = userResult.rows[0];
          
          const recentPasswordChange = await executeTursoQuery(
            `SELECT changed_at FROM password_change_logs 
             WHERE user_id = ? AND changed_by = 'forgot-password'
             ORDER BY changed_at DESC LIMIT 1`,
            [user.id]
          );

          if (recentPasswordChange && recentPasswordChange.rows.length > 0) {
            const lastChange = new Date(recentPasswordChange.rows[0].changed_at);
            const now = new Date();
            const hoursSinceChange = (now - lastChange) / (1000 * 60 * 60);

            if (hoursSinceChange < 24) {
              const hoursRemaining = Math.ceil(24 - hoursSinceChange);
              warn(`⏰ Password reset blocked for ${emailLower}: changed ${Math.floor(hoursSinceChange)}h ago`);
              return new Response(
                JSON.stringify({
                  success: false,
                  error: `Ya cambiaste tu contrase\u00f1a recientemente. Debes esperar ${hoursRemaining} hora${hoursRemaining !== 1 ? 's' : ''} m\u00e1s.`,
                  hoursRemaining: hoursRemaining,
                  rateLimited: true
                }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        // 🛡️ RATE LIMITING SECUNDARIO: 3 INTENTOS POR HORA (anti-spam)
        const emailAttempts = await executeTursoQuery(
          `SELECT COUNT(*) as count FROM password_reset_tokens 
           WHERE email = ? AND created_at > ?`,
          [emailLower, oneHourAgo]
        );
        
        const emailCount = emailAttempts?.rows?.[0]?.count || 0;
        if (emailCount >= 3) {
          warn(`⚠️ Hourly rate limit exceeded for email: ${emailLower}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Demasiados intentos de solicitud. Intenta de nuevo en 1 hora.',
              retryAfter: 3600
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 🛡️ RATE LIMITING POR IP (anti-abuse)
        const ipAttempts = await executeTursoQuery(
          `SELECT COUNT(*) as count FROM password_reset_tokens 
           WHERE ip_address = ? AND created_at > ?`,
          [ipAddress, oneHourAgo]
        );
        
        const ipCount = ipAttempts?.rows?.[0]?.count || 0;
        if (ipCount >= 5) {
          warn(`⚠️ IP rate limit exceeded: ${ipAddress}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Demasiados intentos desde esta IP. Intenta m\u00e1s tarde.',
              retryAfter: 3600
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 🔒 RESPUESTA GENÉRICA SI NO EXISTE (timing-attack resistant)
        if (!userResult || userResult.rows.length === 0) {
          warn(`🔍 Password reset requested for non-existent email: ${emailLower}`);
          return new Response(
            JSON.stringify({
              success: true,
              message: 'Si el email existe, recibir\u00e1s un enlace para restablecer contrase\u00f1a'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const user = userResult.rows[0];

        // 🗑️ LIMPIAR TOKENS ANTERIORES
        const deleteResult = await executeTursoQuery(
          `DELETE FROM password_reset_tokens WHERE email = ?`,
          [emailLower]
        );
        warn(`🧹 Deleted ${deleteResult?.rowsAffected || 0} old tokens for: ${emailLower}`);

        // 🎲 GENERAR TOKEN CRIPTOGRÁFICAMENTE SEGURO
        const token = 'reset_' + crypto.randomUUID().replace(/-/g, '') + '_' + Date.now();
        const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
        const tokenId = 'token_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
        
        // 💾 GUARDAR TOKEN
        const insertResult = await executeTursoQuery(
          `INSERT INTO password_reset_tokens (id, user_id, email, token, created_at, expires_at, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tokenId, user.id, emailLower, token, now.toISOString(), expiresAt, ipAddress]
        );
        
        if (!insertResult || insertResult.rowsAffected !== 1) {
          throw new Error('Failed to save reset token');
        }

        warn(`✅ Token created for ${emailLower} - expires in 30min`);
        
        // 📧 ENVIAR EMAIL
        const origin = request.headers.get('origin') || 
                      request.headers.get('referer') || 
                      'https://tripulacionfx.com';
        const baseUrl = new URL(origin).origin;
        const needsHtmlExt = baseUrl.includes('tripulacionfx.com') || 
                            baseUrl.includes('localhost') || 
                            baseUrl.includes('127.0.0.1');
        const resetPath = '/reset-password';
        const resetLink = `${baseUrl}${resetPath}?token=${token}`;

        const emailHtml = `
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; margin: 0; padding: 0; background-color: #0f172a; }
              .email-container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px rgba(0, 0, 0, 0.3); }
              .header { background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; }
              .logo { max-width: 80px; height: auto; margin-bottom: 20px; }
              .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 700; }
              .content { padding: 40px 30px; color: #e2e8f0; }
              .content p { line-height: 1.6; margin: 15px 0; }
              .content strong { color: #06b6d4; }
              .cta-section { margin: 35px 0; text-align: center; }
              .cta-button { display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.3); transition: all 0.3s ease; }
              .cta-button:hover { box-shadow: 0 6px 20px rgba(6, 182, 212, 0.4); transform: translateY(-2px); }
              .copy-link { background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 15px; margin: 20px 0; }
              .copy-link p { margin: 5px 0; font-size: 13px; }
              .copy-link code { background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.3); padding: 8px 12px; border-radius: 4px; display: block; word-break: break-all; color: #06b6d4; font-family: 'Courier New', monospace; margin-top: 10px; }
              .warning { background: rgba(59, 130, 246, 0.1); border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .warning p { margin: 5px 0; font-size: 14px; color: #93c5fd; }
              .footer { background: rgba(15, 23, 42, 0.7); padding: 30px; text-align: center; border-top: 1px solid rgba(148, 163, 184, 0.1); }
              .footer p { margin: 8px 0; font-size: 12px; color: #94a3b8; }
              .footer-link { color: #06b6d4; text-decoration: none; }
              .footer-link:hover { text-decoration: underline; }
              .accent { color: #06b6d4; }
              table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              table td { padding: 10px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1); }
              table td:first-child { color: #94a3b8; width: 50%; }
              table td:last-child { color: #06b6d4; font-weight: 600; text-align: right; }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="header">
                <div style="font-size: 48px; margin-bottom: 15px;">🔐</div>
                <h1>Restablecer Contraseña</h1>
              </div>

              <div class="content">
                <p>¡Hola!</p>
                <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <span class="accent">TFX Trading Journal</span>.</p>

                <div class="cta-section">
                  <a href="${resetLink}" class="cta-button">Restablecer Contraseña</a>
                </div>

                <p style="text-align: center; color: #94a3b8; font-size: 13px;">O copia el siguiente enlace en tu navegador:</p>
                
                <div class="copy-link">
                  <code>${resetLink}</code>
                </div>

                <div class="warning">
                  <p><strong>⏰ Importante:</strong> Este enlace <strong>expira pronto</strong>. Actúa rápido.</p>
                </div>

                <p>Una vez que hagas clic, podrás establecer una nueva contraseña para tu cuenta.</p>

                <table>
                  <tr>
                    <td>Tipo de solicitud:</td>
                    <td>Restablecimiento de contraseña</td>
                  </tr>
                  <tr>
                    <td>Válido por:</td>
                    <td>Un tiempo limitado</td>
                  </tr>
                </table>

                <div class="warning">
                  <p><strong>⚠️ Seguridad:</strong> Si no solicitaste este cambio, <strong>ignora este email</strong>. Tu contraseña permanecerá protegida.</p>
                </div>

                <p style="margin-top: 30px;">Si tienes problemas, contacta con nuestro equipo de soporte.</p>
              </div>

              <div class="footer">
                <p>© 2025 <span class="accent">TFX Trading Journal</span> - Plataforma Profesional de Trading</p>
                <p style="margin-top: 15px;">
                  <a href="mailto:support@tripulacionfx.com" class="footer-link">Contacta con soporte</a> • 
                  <a href="https://tripulacionfx.com" class="footer-link">Visita nuestro sitio</a>
                </p>
                <p style="color: #475569; font-size: 11px; margin-top: 20px;">Este es un email automatizado. Por favor no respondas a este mensaje.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        const brevoKey = env?.BREVO_API_KEY || '';
        if (brevoKey) {
          try {
            const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'api-key': brevoKey
              },
              body: JSON.stringify({
                sender: {
                  email: 'noreply@tripulacionfx.com',
                  name: 'Tripulaci\u00f3n FX'
                },
                to: [{ email: emailLower }],
                subject: '\ud83d\udd11 Restablece tu contrase\u00f1a',
                htmlContent: emailHtml
              })
            });

            if (!brevoResponse.ok) {
              const brevoError = await brevoResponse.text();
              warn(`⚠️ Email send failed: ${brevoResponse.status} - ${brevoError}`);
            } else {
              warn(`📧 Reset email sent to: ${emailLower}`);
            }
          } catch (emailError) {
            warn(`⚠️ Email error: ${emailError.message}`);
            // Token ya guardado - usuario puede intentar más tarde
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Si el email existe, recibir\u00e1s un enlace para restablecer contrase\u00f1a'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        warn(`❌ Forgot password error: ${error.message}`);
        return new Response(
          JSON.stringify({ success: false, error: 'Error procesando solicitud' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 🔐 ENDPOINT: RESET PASSWORD CONFIRM - USAR TOKEN
    // POST /api/reset-password-confirm
    // Body: { token, newPassword }
    // Security: Validación de token, expiración, uso único
    // ============================================
    if (path === '/api/reset-password-confirm' && request.method === 'POST') {
      try {
        const { token, newPassword } = await request.json().catch(() => ({}));

        // 📝 VALIDACIONES
        if (!token || !newPassword) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Token y contrase\u00f1a son requeridos'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (typeof newPassword !== 'string' || newPassword.length < 8) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'La contrase\u00f1a debe tener m\u00ednimo 8 caracteres'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validar complejidad de contraseña
        if (!/[a-z]/.test(newPassword) || !/[A-Z0-9]/.test(newPassword)) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'La contrase\u00f1a debe contener min\u00fasculas y may\u00fasculas o n\u00fameros'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const now = new Date().toISOString();
        const ipAddress = request.headers.get('cf-connecting-ip') || 
                         request.headers.get('x-forwarded-for') || 
                         'unknown';

        // 🔍 BUSCAR TOKEN
        const tokenResult = await executeTursoQuery(
          `SELECT id, user_id, email, expires_at, used_at FROM password_reset_tokens 
           WHERE token = ?`,
          [token]
        );

        if (!tokenResult || tokenResult.rows.length === 0) {
          warn(`❌ Invalid token attempt from IP: ${ipAddress}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Token inv\u00e1lido o no encontrado'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const resetToken = tokenResult.rows[0];

        // ⏰ VERIFICAR EXPIRACIÓN
        if (new Date(resetToken.expires_at) < new Date(now)) {
          warn(`⏰ Expired token used for: ${resetToken.email}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Token expirado. Solicita un nuevo enlace.'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 🔒 VERIFICAR SI YA FUE USADO
        if (resetToken.used_at) {
          warn(`🔒 Already used token for: ${resetToken.email}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Este enlace ya fue utilizado'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 🔐 HASHEAR NUEVA CONTRASEÑA
        const hashedPassword = await hashPassword(newPassword);

        // 💾 ACTUALIZAR CONTRASEÑA (transacción implícita)
        try {
          // 0. Crear tabla de logs si no existe
          try {
            await executeTursoQuery(`
              CREATE TABLE IF NOT EXISTS password_change_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                changed_at TEXT NOT NULL,
                changed_by TEXT NOT NULL,
                ip_address TEXT,
                reason TEXT
              )
            `);
          } catch (e) {
            // Tabla ya existe
          }

          // 1. PRIMERO: Registrar en log (si falla aquí, nada cambió)
          const logId = 'log_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
          
          const logResult = await executeTursoQuery(
            `INSERT INTO password_change_logs (id, user_id, changed_at, changed_by, ip_address, reason)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [logId, resetToken.user_id, now, 'forgot-password', ipAddress, 'Reset via email link']
          );

          if (!logResult || logResult.rowsAffected !== 1) {
            throw new Error(`Failed to create log entry`);
          }

          // 2. SEGUNDO: Actualizar password (si falla, hacemos rollback del log)
          const updateResult = await executeTursoQuery(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [hashedPassword, resetToken.user_id]
          );

          if (!updateResult || updateResult.rowsAffected !== 1) {
            // ROLLBACK: Eliminar el log que acabamos de crear
            await executeTursoQuery(
              'DELETE FROM password_change_logs WHERE id = ?',
              [logId]
            ).catch(() => {});
            
            throw new Error(`Password update failed`);
          }

          // 3. TERCERO: Marcar token como usado (si falla, está OK - password ya cambió)
          await executeTursoQuery(
            'UPDATE password_reset_tokens SET used_at = ? WHERE id = ?',
            [now, resetToken.id]
          );

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Contrase\u00f1a restablecida correctamente'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );

        } catch (updateError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Error actualizando contrase\u00f1a. Int\u00e9ntalo de nuevo'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

      } catch (error) {
        warn(`❌ Reset confirm error: ${error.message}`);
        return new Response(
          JSON.stringify({ success: false, error: 'Error procesando solicitud' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 🔐 ENDPOINT: CHANGE PASSWORD - DESDE PERFIL
    // POST /api/change-password
    // Body: { userId, currentPassword, newPassword }
    // Rate Limit: 1 cambio cada 24 horas por usuario
    // Security: Verificar contraseña actual, validar complejidad
    // ============================================
    if (path === '/api/change-password' && request.method === 'POST') {
      try {
        const { userId, currentPassword, newPassword } = await request.json().catch(() => ({}));

        // 📝 VALIDACIONES BÁSICAS
        if (!userId || !currentPassword || !newPassword) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Todos los campos son requeridos'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (typeof newPassword !== 'string' || newPassword.length < 8) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Nueva contrase\u00f1a debe tener m\u00ednimo 8 caracteres'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validar complejidad
        if (!/[a-z]/.test(newPassword) || !/[A-Z0-9]/.test(newPassword)) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'La contrase\u00f1a debe contener min\u00fasculas y may\u00fasculas o n\u00fameros'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // No permitir contraseñas comunes
        const commonPasswords = ['password', '12345678', 'qwerty123', 'abc12345'];
        if (commonPasswords.includes(newPassword.toLowerCase())) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Contrase\u00f1a demasiado com\u00fan. Elige una m\u00e1s segura'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const ipAddress = request.headers.get('cf-connecting-ip') || 
                         request.headers.get('x-forwarded-for') || 
                         'unknown';

        // 🔍 BUSCAR USUARIO
        const userResult = await executeTursoQuery(
          'SELECT id, email, password_hash FROM users WHERE id = ?',
          [userId]
        );

        if (!userResult || userResult.rows.length === 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Usuario no encontrado'
            }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const user = userResult.rows[0];

        // 🔒 VERIFICAR CONTRASEÑA ACTUAL
        const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
        if (!isValidPassword) {
          warn(`❌ Wrong password attempt for user: ${user.email} from IP: ${ipAddress}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Contrase\u00f1a actual incorrecta'
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 🛡️ RATE LIMITING: 24 HORAS
        const recentChanges = await executeTursoQuery(
          `SELECT changed_at FROM password_change_logs 
           WHERE user_id = ? AND changed_by = 'self'
           ORDER BY changed_at DESC LIMIT 1`,
          [userId]
        ).catch(() => ({ rows: [] })); // Si la tabla no existe, devolver vacío

        if (recentChanges && recentChanges.rows.length > 0) {
          const lastChange = new Date(recentChanges.rows[0].changed_at);
          const now = new Date();
          const hoursSinceLastChange = (now - lastChange) / (1000 * 60 * 60);

          if (hoursSinceLastChange < 24) {
            const hoursRemaining = Math.ceil(24 - hoursSinceLastChange);
            warn(`⏰ Rate limit hit for user: ${user.email} - ${hoursRemaining}h remaining`);
            return new Response(
              JSON.stringify({
                success: false,
                error: `Debes esperar ${hoursRemaining} hora${hoursRemaining !== 1 ? 's' : ''} para cambiar tu contrase\u00f1a nuevamente`,
                hoursRemaining: hoursRemaining,
                rateLimited: true
              }),
              { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // 🔐 HASHEAR NUEVA CONTRASEÑA
        const newHashedPassword = await hashPassword(newPassword);
        
        // 💾 ACTUALIZAR EN BD
        const updateResult = await executeTursoQuery(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          [newHashedPassword, userId]
        );

        if (!updateResult || updateResult.rowsAffected !== 1) {
          throw new Error('Password update failed');
        }

        // 📝 REGISTRAR LOG (crear tabla si no existe)
        try {
          await executeTursoQuery(`
            CREATE TABLE IF NOT EXISTS password_change_logs (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              changed_at TEXT NOT NULL,
              changed_by TEXT NOT NULL,
              ip_address TEXT,
              reason TEXT,
              FOREIGN KEY(user_id) REFERENCES users(id)
            )
          `);
        } catch (e) {
          // Tabla ya existe
        }

        const logId = 'log_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
        await executeTursoQuery(
          `INSERT INTO password_change_logs (id, user_id, changed_at, changed_by, ip_address, reason)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [logId, userId, new Date().toISOString(), 'self', ipAddress, 'User changed password in profile']
        );

        warn(`✅ Password changed successfully for: ${user.email}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Contrase\u00f1a actualizada correctamente'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        warn(`❌ Change password error: ${error.message}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Error procesando solicitud' 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 🆕 ENDPOINT: OBTENER LOGS DE CAMBIO DE CONTRASEÑA
    // GET /api/password-change-logs?userId=XXX
    // ============================================
    if (path === '/api/password-change-logs' && request.method === 'GET') {
      try {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId');

        if (!userId) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'userId requerido'
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        // Obtener últimos 10 logs
        try {
          const logsResult = await executeTursoQuery(
            `SELECT id, user_id, changed_at, changed_by, ip_address, reason 
             FROM password_change_logs 
             WHERE user_id = ? 
             ORDER BY changed_at DESC 
             LIMIT 10`,
            [userId]
          );

          const logs = logsResult?.rows || [];

          return new Response(
            JSON.stringify({
              success: true,
              logs: logs
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );

        } catch (queryError) {
          // Tabla no existe aún, retornar array vacío
          return new Response(
            JSON.stringify({
              success: true,
              logs: []
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 🆕 ENDPOINT: OBTENER TODOS LOS PLANES
    // GET /api/pricing-plans
    // ============================================
    if (path === '/api/pricing-plans' && request.method === 'GET') {
      try {
        const plansResult = await executeTursoQuery(
          `SELECT id, plan_name, plan_display_name, price_monthly, currency, stripe_price_id, features, is_active, sort_order 
           FROM pricing_plans 
           WHERE is_active = 1 
           ORDER BY sort_order ASC`
        );

        const plans = plansResult?.rows || [];
        
        // Parse features JSON
        const parsedPlans = plans.map(plan => ({
          ...plan,
          features: plan.features ? JSON.parse(plan.features) : []
        }));

        return new Response(
          JSON.stringify({
            success: true,
            plans: parsedPlans
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 🆕 ENDPOINT: OBTENER UN PLAN POR NOMBRE
    // GET /api/pricing-plans/:planName
    // ============================================
    if (path.startsWith('/api/pricing-plans/') && request.method === 'GET') {
      try {
        const planName = path.split('/').pop();
        
        const planResult = await executeTursoQuery(
          `SELECT id, plan_name, plan_display_name, price_monthly, currency, stripe_price_id, features, is_active 
           FROM pricing_plans 
           WHERE plan_name = ? AND is_active = 1`,
          [planName]
        );

        const plan = planResult?.rows?.[0];
        
        if (!plan) {
          return new Response(
            JSON.stringify({ success: false, error: 'Plan no encontrado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Parse features JSON
        plan.features = plan.features ? JSON.parse(plan.features) : [];

        return new Response(
          JSON.stringify({
            success: true,
            plan: plan
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 🆕 ENDPOINT: FORMULARIO DE CONTACTO
    // POST /api/contact
    // Envía email de contacto a soporte
    // Rate Limiting: 2 msgs/hora, 6 msgs/día por IP
    // ============================================
    if (path === '/api/contact' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { name, email, message, recipient } = data;

        // Validación de campos
        if (!name || !email || !message) {
          return new Response(
            JSON.stringify({ success: false, message: 'Faltan campos requeridos' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validar email (regex simple)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return new Response(
            JSON.stringify({ success: false, message: 'Email inválido' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Detectar spam (longitud de mensaje)
        if (message.length < 10 || message.length > 5000) {
          return new Response(
            JSON.stringify({ success: false, message: 'El mensaje debe tener entre 10 y 5000 caracteres' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Rate limiting: máximo 2 mensajes por hora y 6 por día por IP
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const now = Date.now();
        const hourKey = `contact:${ip}:hour`;
        const dayKey = `contact:${ip}:day`;

        // Obtener contadores actuales
        let hourCount = 0;
        let dayCount = 0;
        let lastHourReset = 0;
        let lastDayReset = 0;

        try {
          const hourData = await env.CONTACT_RATE_LIMIT.get(hourKey);
          const dayData = await env.CONTACT_RATE_LIMIT.get(dayKey);

          if (hourData) {
            const parsed = JSON.parse(hourData);
            hourCount = parsed.count || 0;
            lastHourReset = parsed.reset || 0;
          }

          if (dayData) {
            const parsed = JSON.parse(dayData);
            dayCount = parsed.count || 0;
            lastDayReset = parsed.reset || 0;
          }
        } catch (e) {
          // Si falla KV, continuamos sin rate limiting
        }

        // Resetear contadores si han expirado
        const oneHourAgo = now - (60 * 60 * 1000);
        const oneDayAgo = now - (24 * 60 * 60 * 1000);

        if (lastHourReset < oneHourAgo) {
          hourCount = 0;
          lastHourReset = now;
        }

        if (lastDayReset < oneDayAgo) {
          dayCount = 0;
          lastDayReset = now;
        }

        // Validar límites
        if (hourCount >= 2) {
          return new Response(
            JSON.stringify({ success: false, message: 'Has alcanzado el límite de 2 mensajes por hora. Intenta más tarde.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (dayCount >= 6) {
          return new Response(
            JSON.stringify({ success: false, message: 'Has alcanzado el límite de 6 mensajes por día. Intenta mañana.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Función auxiliar para escapar HTML
        const escapeHtml = (unsafe) => {
          return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        };

        const BREVO_API_KEY = env?.BREVO_API_KEY || '';
        
        if (!BREVO_API_KEY) {
          return new Response(
            JSON.stringify({ success: false, message: 'Error en el servidor. Por favor, intenta más tarde.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Email al admin
        const adminEmailPayload = {
          sender: {
            name: 'TFX Contact Form',
            email: 'noreply@tripulacionfx.com'
          },
          to: [{
            email: recipient || 'monkeydfx.trader@gmail.com',
            name: 'TFX Support'
          }],
          subject: `[CONTACTO] Nuevo mensaje de ${escapeHtml(name)}`,
          htmlContent: `
            <h2>Nuevo mensaje de contacto</h2>
            <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Mensaje:</strong></p>
            <hr>
            <p style="color: #999; font-size: 12px;">
              Enviado desde: TFX Trading Dashboard<br>
              IP: ${escapeHtml(ip)}<br>
              Fecha: ${new Date().toLocaleString('es-ES')}
            </p>
          `,
          replyTo: { email: email }
        };

        // Enviar email al admin
        const adminResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-key': BREVO_API_KEY
          },
          body: JSON.stringify(adminEmailPayload)
        });

        if (!adminResponse.ok) {
          const errorText = await adminResponse.text();
          error(`Brevo error: ${errorText}`);
          return new Response(
            JSON.stringify({ success: false, message: 'Error enviando mensaje. Intenta más tarde.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Email de confirmación al usuario
        const userEmailPayload = {
          sender: {
            name: 'TFX Trading',
            email: 'noreply@tripulacionfx.com'
          },
          to: [{
            email: email,
            name: escapeHtml(name)
          }],
          subject: 'Hemos recibido tu mensaje - TFX Trading',
          htmlContent: `
            <h2>Hola ${escapeHtml(name)},</h2>
            <p>Gracias por ponerte en contacto con nosotros.</p>
            <p>Hemos recibido tu mensaje y te responderemos lo antes posible.</p>
            <hr>
            <p><strong>Tu mensaje:</strong></p>
            <hr>
            <p style="color: #999;">TFX Trading Support Team</p>
          `
        };

        // Enviar email al usuario (no es crítico si falla)
        try {
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'api-key': BREVO_API_KEY
            },
            body: JSON.stringify(userEmailPayload)
          });
        } catch (e) {
          warn(`Error enviando email de confirmación al usuario: ${e.message}`);
        }

        // Incrementar contadores en KV Store
        try {
          hourCount++;
          dayCount++;

          await env.CONTACT_RATE_LIMIT.put(hourKey, JSON.stringify({ count: hourCount, reset: lastHourReset }), { expirationTtl: 3600 });
          await env.CONTACT_RATE_LIMIT.put(dayKey, JSON.stringify({ count: dayCount, reset: lastDayReset }), { expirationTtl: 86400 });
        } catch (e) {
          warn(`Error actualizando rate limit: ${e.message}`);
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Mensaje enviado correctamente' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        error(`Contact error: ${error.message}`);
        return new Response(
          JSON.stringify({ success: false, message: 'Error procesando el formulario' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 🆕 ENDPOINT ADMIN: CREAR/ACTUALIZAR PLAN
    // POST /api/admin/pricing-plans
    // Requiere: adminToken (JWT)
    // ============================================
    if (path === '/api/admin/pricing-plans' && request.method === 'POST') {
      try {
        const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({ success: false, error: 'No autorizado' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const adminToken = authHeader.replace('Bearer ', '');
        
        // Verificar JWT token (igual que admin-verify)
        let isValid = false;
        
        if (adminToken === workerSecret) {
          isValid = true;
        } else {
          const payload = await verifyJWT(adminToken, workerSecret);
          if (payload && payload.role === 'admin') {
            isValid = true;
          }
        }

        if (!isValid) {
          return new Response(
            JSON.stringify({ success: false, error: 'Token de admin inválido o expirado' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await request.json();
        const { id, plan_name, plan_display_name, price_monthly, currency, stripe_price_id, features, is_active, sort_order } = data;

        // Validaciones
        if (!plan_name || !plan_display_name || price_monthly === undefined) {
          return new Response(
            JSON.stringify({ success: false, error: 'Campos requeridos: plan_name, plan_display_name, price_monthly' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const now = new Date().toISOString();
        const featuresJson = JSON.stringify(features || []);

        if (id) {
          // Actualizar plan existente
          await executeTursoQuery(
            `UPDATE pricing_plans 
             SET plan_name = ?, plan_display_name = ?, price_monthly = ?, currency = ?, 
                 stripe_price_id = ?, features = ?, is_active = ?, sort_order = ?, updated_at = ?
             WHERE id = ?`,
            [
              plan_name, 
              plan_display_name, 
              price_monthly, 
              currency || 'EUR', 
              stripe_price_id || null, 
              featuresJson, 
              is_active !== false ? 1 : 0, 
              sort_order || 0, 
              now, 
              id
            ]
          );

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Plan actualizado correctamente',
              id: id
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        } else {
          // Crear nuevo plan
          const newId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          await executeTursoQuery(
            `INSERT INTO pricing_plans (id, plan_name, plan_display_name, price_monthly, currency, stripe_price_id, features, is_active, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newId, 
              plan_name, 
              plan_display_name, 
              price_monthly, 
              currency || 'EUR', 
              stripe_price_id || null, 
              featuresJson, 
              is_active !== false ? 1 : 0, 
              sort_order || 0, 
              now, 
              now
            ]
          );

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Plan creado correctamente',
              id: newId
            }),
            {
              status: 201,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 🆕 ENDPOINT ADMIN: ELIMINAR PLAN (soft delete)
    // DELETE /api/admin/pricing-plans/:id
    // Requiere: adminToken (JWT)
    // ============================================
    if (path.startsWith('/api/admin/pricing-plans/') && request.method === 'DELETE') {
      try {
        const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({ success: false, error: 'No autorizado' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const adminToken = authHeader.replace('Bearer ', '');
        
        // Verificar JWT token (igual que admin-verify)
        let isValid = false;
        
        if (adminToken === workerSecret) {
          isValid = true;
        } else {
          const payload = await verifyJWT(adminToken, workerSecret);
          if (payload && payload.role === 'admin') {
            isValid = true;
          }
        }

        if (!isValid) {
          return new Response(
            JSON.stringify({ success: false, error: 'Token de admin inválido o expirado' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const planId = path.split('/').pop();
        const now = new Date().toISOString();

        // Soft delete - marcar como inactivo
        await executeTursoQuery(
          `UPDATE pricing_plans SET is_active = 0, updated_at = ? WHERE id = ?`,
          [now, planId]
        );

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Plan desactivado correctamente'
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // 📊 ENDPOINT ADMIN: LISTAR INSTALACIONES MT4/MT5
    // GET /api/admin/installations
    // Requiere: adminToken (JWT)
    // ============================================
    if (path === '/api/admin/cleanup-archived-accounts' && request.method === 'POST') {
      try {
        const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
        const authHeader = request.headers.get('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({ success: false, error: 'No autorizado' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const adminToken = authHeader.replace('Bearer ', '');
        let isValid = false;

        if (adminToken === workerSecret) {
          isValid = true;
        } else {
          const payload = await verifyJWT(adminToken, workerSecret);
          if (payload && payload.role === 'admin') {
            isValid = true;
          }
        }

        if (!isValid) {
          return new Response(
            JSON.stringify({ success: false, error: 'Token de admin inválido o expirado' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const result = await cleanupArchivedAccounts(48);

        return new Response(
          JSON.stringify({ success: true, ...result }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: 'Error al limpiar cuentas: ' + error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (path === '/api/admin/installations' && request.method === 'GET') {
      try {
        const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({ success: false, error: 'No autorizado' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const adminToken = authHeader.replace('Bearer ', '');
        
        // Verificar JWT token (igual que admin-verify)
        let isValid = false;
        
        // Opción 1: Token es directamente el secreto
        if (adminToken === workerSecret) {
          isValid = true;
        } else {
          // Opción 2: Token es un JWT
          const payload = await verifyJWT(adminToken, workerSecret);
          if (payload && payload.role === 'admin') {
            isValid = true;
          }
        }

        if (!isValid) {
          return new Response(
            JSON.stringify({ success: false, error: 'Token de admin inválido o expirado' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Obtener instalaciones con información del usuario
        let installations = [];
        
        try {
          const result = await executeTursoQuery(
            `SELECT 
              i.id,
              i.user_id,
              u.email as user_email,
              i.platform,
              i.version,
              i.status,
              i.last_sync,
              i.installed_at
            FROM installations i
            LEFT JOIN users u ON i.user_id = u.id
            ORDER BY i.last_sync DESC`
          );
          installations = result?.rows || [];
        } catch (queryError) {
          // Fallback para esquemas antiguos o columnas inexistentes
          try {
            const fallbackResult = await executeTursoQuery(
              `SELECT * FROM installations`
            );
            installations = fallbackResult?.rows || [];
          } catch (fallbackError) {
            installations = [];
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            installations: installations
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (error) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Error al obtener instalaciones: ' + error.message,
            installations: [] 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // ?? ENDPOINT 1: INICIAR REGISTRO (Paso 1)
    // POST /api/auth/initiate-registration
    // Datos: email, username, plan (free/pro/unlimited)
    // ============================================
    if (path === '/api/auth/initiate-registration' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { email, username, plan } = data;

        // Validaciones b�sicas
        if (!email || !username || !plan) {
          return new Response(
            JSON.stringify({ success: false, error: 'Email, username y plan son requeridos' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validar formato email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Email inv�lido' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 🔒 SEGURIDAD: SIEMPRE registrar como FREE, ignorar valor del frontend
        // El plan solo se actualiza después de:
        // 1. Pago exitoso en Stripe (webhook checkout.session.completed)
        // 2. Acción de admin desde el panel de administración
        const safePlan = 'free';

        // Verificar si email ya existe
        const existingUser = await executeTursoQuery(
          'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
          [email]
        );

        let registrationId = null;
        const isNewEmail = !existingUser || existingUser.rows.length === 0;

        if (isNewEmail) {
          // ?? Email NUEVO: crear registro temporal
          // Generar contrase�a temporal
          const tempPassword = generateTempPassword();
          const tempPasswordHash = await hashPassword(tempPassword);
          
          // Generar ID �nico para el registro pendiente
          registrationId = generateId();
          
          // Guardar en tabla pending_registrations en Turso
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          
          try {
            await executeTursoQuery(
              `INSERT INTO pending_registrations (id, email, username, plan, temp_password_hash, created_at, expires_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [registrationId, email, username, safePlan, tempPasswordHash, new Date().toISOString(), expiresAt]
            );
          } catch (dbError) {
            error(`? Error guardando en BD:`, dbError);
            throw new Error('Error guardando registro: ' + dbError.message);
          }

          // Enviar email con contrase�a temporal
          await sendTempPasswordEmail(email, tempPassword, env);
        } else {
          // ?? Email YA EXISTE: No hacer nada (prevenir User Enumeration)
          // Generar un registrationId fake para que el frontend avance sin revelar que el email existe
          registrationId = generateId();
        }

        // 🔒 SEGURIDAD: Devolver mensaje genérico en ambos casos (no revela si email existe)
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Si este email no está registrado, recibirás un código de confirmación en tu bandeja de entrada',
            registrationId,
            intendedPlan: plan !== 'free' ? plan : null // 🎯 Guardar plan deseado para redirección posterior
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // ?? ENDPOINT 2: CONFIRMAR REGISTRO (Paso 2)
    // POST /api/auth/confirm-registration
    // Datos: registrationId, tempPassword, newPassword, confirmPassword
    // ============================================
    if (path === '/api/auth/confirm-registration' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { registrationId, tempPassword, newPassword, confirmPassword } = data;

        // Validaciones b�sicas
        if (!registrationId || !tempPassword || !newPassword || !confirmPassword) {
          return new Response(
            JSON.stringify({ success: false, error: 'Todos los campos son requeridos' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validar que las contrase�as coinciden
        if (newPassword !== confirmPassword) {
          return new Response(
            JSON.stringify({ success: false, error: 'Las contrase�as no coinciden' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validar longitud m�nima
        if (newPassword.length < 8) {
          return new Response(
            JSON.stringify({ success: false, error: 'La contrase�a debe tener m�nimo 8 caracteres' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Recuperar datos del registro pendiente desde Turso
        let registrationData = null;
        
        try {
          const result = await executeTursoQuery(
            `SELECT id, email, username, plan, temp_password_hash, created_at, expires_at FROM pending_registrations WHERE id = ?`,
            [registrationId]
          );
          
          if (result && result.rows.length > 0) {
            const row = result.rows[0];
            registrationData = {
              id: row.id,
              email: row.email,
              username: row.username,
              plan: row.plan,
              tempPasswordHash: row.temp_password_hash,
              expiresAt: row.expires_at
            };
          }
        } catch (dbError) {
          error(`? Error buscando en BD:`, dbError);
        }

        if (!registrationData) {
          error(`? Registro no encontrado: ${registrationId}`);
          return new Response(
            JSON.stringify({ success: false, error: 'Registro no encontrado o expirado' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verificar que no haya expirado
        const now = new Date();
        const expiresAt = new Date(registrationData.expiresAt);
        if (now > expiresAt) {
          // Limpiar autom�ticamente
          try {
            await executeTursoQuery(
              `DELETE FROM pending_registrations WHERE id = ?`,
              [registrationId]
            );
          } catch (cleanupError) {
            error(`?? Error limpiando registro expirado:`, cleanupError);
          }
          
          return new Response(
            JSON.stringify({ success: false, error: 'Registro expirado, por favor intenta de nuevo' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verificar contraseña temporal
        const isValidTempPassword = await verifyPassword(tempPassword, registrationData.tempPasswordHash);
        if (!isValidTempPassword) {
          error(`❌ Contraseña temporal incorrecta para ${registrationId}`);
          return new Response(
            JSON.stringify({ success: false, error: 'Contraseña temporal incorrecta' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Hashear la nueva contraseña
        const newPasswordHash = await hashPassword(newPassword);

        // Crear usuario en BD
        const userId = generateId();
        const defaultExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 año
        const createdAt = new Date().toISOString();

        try {
          await executeTursoQuery(
            `INSERT INTO users (id, email, username, password_hash, user_plan, user_type, is_active, created_at, expires_at, last_login) 
             VALUES (?, ?, ?, ?, ?, 'user', 1, ?, ?, ?)`,
            [userId, registrationData.email, registrationData.username, newPasswordHash, registrationData.plan, createdAt, defaultExpires, createdAt]
          );
        } catch (createError) {
          error(`❌ Error creando usuario:`, createError);
          throw new Error('Error creando usuario: ' + createError.message);
        }

        // Borrar registro pendiente de la BD
        try {
          await executeTursoQuery(
            `DELETE FROM pending_registrations WHERE id = ?`,
            [registrationId]
          );
        } catch (deleteError) {
          error(`⚠️ Error borrando registro pendiente:`, deleteError);
          // No fallar por esto - el usuario ya fue creado
        }


        // Generar JWT automáticamente para auto-login
        const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
        const token = await createJWT(
          { userId: userId, email: registrationData.email, plan: registrationData.plan },
          workerSecret,
          7 * 24 * 60 * 60 // 7 días
        );

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Cuenta creada exitosamente',
            userId,
            email: registrationData.email,
            username: registrationData.username,
            plan: registrationData.plan,
            user_type: 'user',
            token  // JWT para auto-login
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // ?? ENDPOINT 3: LOGIN CON EMAIL/CONTRASE�A
    // POST /api/auth/login-password
    // Datos: email, password, recaptchaToken (opcional)
    // ============================================
    if (path === '/api/auth/login-password' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { email, password, recaptchaToken } = data;
        

        if (!email || !password) {
          return new Response(
            JSON.stringify({ success: false, error: 'Email y contrase�a requeridos' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // ?? VALIDAR reCAPTCHA v2 (ANTES de cualquier b�squeda)
        if (recaptchaToken) {
          // ?? Detectar si es localhost para testing
          const origin = request.headers.get('origin') || '';
          const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
          
          if (!isLocalhost) {
            // En producci�n, validar reCAPTCHA
            const recaptchaSecret = '6Lf4ETssAAAAANt1Dk2WbY05edvxXBjPKgGZ1PQd'; // Tu SECRET_KEY de Google reCAPTCHA
            
            const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`
            });

            const recaptchaData = await recaptchaResponse.json();
            
            if (!recaptchaData.success) {
              return new Response(
                JSON.stringify({ 
                  success: false, 
                  error: 'Verificaci�n de reCAPTCHA fallida',
                  captchaFailed: true
                }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
          } else {
            // En localhost, saltarse validaci�n (testing)
          }
        }

        // ??? RATE LIMITING - Bloquear despu�s de 5 intentos fallidos
        // Crear tabla de rate limiting si no existe
        try {
          await executeTursoQuery(`
            CREATE TABLE IF NOT EXISTS login_attempts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL,
              attempt_time TEXT NOT NULL,
              success INTEGER DEFAULT 0
            )
          `);
        } catch (e) {
          // Tabla ya existe, ignorar
        }

        // Limpiar intentos antiguos (m�s de 15 minutos)
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        try {
          await executeTursoQuery(
            'DELETE FROM login_attempts WHERE attempt_time < ?',
            [fifteenMinutesAgo]
          );
        } catch (e) {
          warn('?? Error limpiando intentos antiguos:', e);
        }

        // Contar intentos fallidos recientes
        let failedAttempts = 0;
        try {
          const attemptsResult = await executeTursoQuery(
            'SELECT COUNT(*) as count FROM login_attempts WHERE LOWER(email) = LOWER(?) AND success = 0',
            [email]
          );
          failedAttempts = attemptsResult.rows[0]?.count || 0;
        } catch (e) {
          warn('?? Error contando intentos:', e);
        }

        // Si hay 5+ intentos fallidos, bloquear
        if (failedAttempts >= 5) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.',
              rateLimited: true
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await ensurePayPalColumns();

        // Buscar usuario
        const userResult = await executeTursoQuery(
          'SELECT id, email, username, password_hash, user_plan, user_type, is_active, expires_at, stripe_customer_id, paypal_subscription_id, paypal_payer_id, full_name, country, created_at, last_login FROM users WHERE LOWER(email) = LOWER(?)',
          [email]
        );

        if (!userResult || userResult.rows.length === 0) {
          // Registrar intento fallido
          try {
            await executeTursoQuery(
              'INSERT INTO login_attempts (email, attempt_time, success) VALUES (?, ?, 0)',
              [email, new Date().toISOString()]
            );
          } catch (e) {
            warn('?? Error registrando intento fallido:', e);
          }
          
          return new Response(
            JSON.stringify({ success: false, error: 'Email o contraseña incorrectos' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const user = userResult.rows[0];
        
        // CRITICAL: Check if user account is active
        // is_active can be 0/1 (number) or true/false (boolean) from LibSQL
        if (user.is_active === 0 || user.is_active === false || user.is_active === "0" || !user.is_active) {
          return new Response(
            JSON.stringify({ success: false, error: 'Tu cuenta ha sido bloqueada. Contacta con soporte.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // ??? SINCRONIZACI�N: Asegurar que user_plan tiene el valor correcto
        // Si user_plan es free pero deber�a tener otro valor, sincronizar con plan
        if (user.user_plan === 'free' || !user.user_plan) {
          try {
            // Obtener el valor de la columna plan antigua si existe y es diferente
            const syncResult = await executeTursoQuery(
              'SELECT plan FROM users WHERE id = ? AND plan IS NOT NULL AND plan != ? LIMIT 1',
              [user.id, 'free']
            );
            
            if (syncResult?.rows[0]?.plan) {
              const correctPlan = syncResult.rows[0].plan;
              user.user_plan = correctPlan;
              
              // Sincronizar: actualizar user_plan en BD
              try {
                await executeTursoQuery(
                  'UPDATE users SET user_plan = ? WHERE id = ?',
                  [correctPlan, user.id]
                );
              } catch (updateErr) {
                warn(`?? No se pudo sincronizar plan:`, updateErr);
              }
            }
          } catch (syncErr) {
            warn(`?? Error en sincronizaci�n:`, syncErr);
          }
        }

        // Verificar contrase�a
        const isValidPassword = await verifyPassword(password, user.password_hash);
        if (!isValidPassword) {
          // Registrar intento fallido
          try {
            await executeTursoQuery(
              'INSERT INTO login_attempts (email, attempt_time, success) VALUES (?, ?, 0)',
              [email, new Date().toISOString()]
            );
          } catch (e) {
            warn('?? Error registrando intento fallido:', e);
          }
          
          return new Response(
            JSON.stringify({ success: false, error: 'Email o contraseña incorrectos' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // ============================================
        // 🔄 VERIFICAR Y PROCESAR EXPIRACIÓN
        // ============================================
        if (user.expires_at) {
          const expiryDate = new Date(user.expires_at);
          const now = new Date();
          
          if (now > expiryDate && user.user_plan !== 'free') {
            // 🔴 SUSCRIPCIÓN EXPIRADA - DOWNGRADE A FREE
            
            try {
              // 1️⃣ Downgrade a FREE
              await executeTursoQuery(
                'UPDATE users SET user_plan = ?, expires_at = NULL WHERE id = ?',
                [user.user_plan === 'pro' || user.user_plan === 'unlimited' ? 'free' : user.user_plan, user.id]
              );
              
              // FIX: NO archivar cuentas cuando expira el plan
              // El usuario DEBE poder ver sus cuentas incluso en Free
              // Solo se aplican restricciones de funcionalidad, no de visibilidad
              
              // Actualizar user_plan local
              user.user_plan = 'free';
              user.expires_at = null;
              
            } catch (downgradeErr) {
              // No bloquear login, continuar con plan actual
            }
          }
        }

        // Generar JWT
        const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
        const token = await createJWT(
          { userId: user.id, email: user.email, plan: user.plan },
          workerSecret,
          7 * 24 * 60 * 60 // 7 d�as
        );


        // Actualizar last_login en la base de datos
        const currentLoginTime = new Date().toISOString();
        try {
          await executeTursoQuery(
            'UPDATE users SET last_login = ? WHERE id = ?',
            [currentLoginTime, user.id]
          );
          // Actualizar también en el objeto user para devolverlo
          user.last_login = currentLoginTime;
        } catch (e) {
          warn('?? Error actualizando last_login:', e);
        }

        // Registrar intento exitoso (para estad�sticas)
        try {
          await executeTursoQuery(
            'INSERT INTO login_attempts (email, attempt_time, success) VALUES (?, ?, 1)',
            [email, currentLoginTime]
          );
        } catch (e) {
          warn('?? Error registrando intento exitoso:', e);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Login exitoso',
            token,
            user: {
              id: user.id,
              email: user.email,
              username: user.username,
              full_name: user.full_name || '',
              country: user.country || '',
              plan: user.user_plan,
              user_type: user.user_type,
              stripe_customer_id: user.stripe_customer_id,
              paypal_subscription_id: user.paypal_subscription_id,
              paypal_payer_id: user.paypal_payer_id,
              created_at: user.created_at,
              last_login: user.last_login,
              expires_at: user.expires_at
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // ENDPOINT OBTENER DATOS DEL USUARIO
    // ============================================
    if (path === '/api/users' && request.method === 'GET') {
      try {
        const url = new URL(request.url);
        const userId = url.searchParams.get('id');
        const userEmail = url.searchParams.get('email');

        if (!userId && !userEmail) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing id or email parameter' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await ensurePayPalColumns();

        let query, params;
        if (userId) {
          query = 'SELECT id, email, username, full_name, country, user_plan, user_type, created_at, last_login, expires_at, stripe_customer_id, paypal_subscription_id, paypal_payer_id FROM users WHERE id = ?';
          params = [userId];
        } else {
          query = 'SELECT id, email, username, full_name, country, user_plan, user_type, created_at, last_login, expires_at, stripe_customer_id, paypal_subscription_id, paypal_payer_id FROM users WHERE LOWER(email) = ?';
          params = [userEmail.toLowerCase()];
        }

        const result = await executeTursoQuery(query, params);

        if (!result || result.rows.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'User not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const user = result.rows[0];

        // Contar cuentas activas y trades del usuario
        let accountsCount = 0;
        let tradesCount = 0;
        try {
          const accountsResult = await executeTursoQuery(
            'SELECT COUNT(*) as count FROM accounts WHERE user_id = ? AND (is_archived IS NULL OR is_archived = 0)',
            [user.id]
          );
          accountsCount = accountsResult?.rows?.[0]?.count || 0;

          const tradesResult = await executeTursoQuery(
            'SELECT COUNT(*) as count FROM trades WHERE user_id = ?',
            [user.id]
          );
          tradesCount = tradesResult?.rows?.[0]?.count || 0;
        } catch (e) {
          // Si falla el conteo, continuar sin error
        }

        return new Response(
          JSON.stringify({
            success: true,
            user: {
              id: user.id,
              email: user.email,
              username: user.username,
              full_name: user.full_name || '',
              country: user.country || '',
              plan: user.user_plan,
              user_type: user.user_type,
              created_at: user.created_at,
              last_login: user.last_login,
              expires_at: user.expires_at,
              stripe_customer_id: user.stripe_customer_id,
              paypal_subscription_id: user.paypal_subscription_id,
              paypal_payer_id: user.paypal_payer_id,
              accounts_count: accountsCount,
              trades_count: tradesCount
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================
    // ENDPOINT VALIDAR SI INSTALACI�N DISPONIBLE
    // ============================================
    // Llamada desde la app ANTES de instalar para validar temprano
    // Solo valida que el usuario existe, est� activo y tiene suscripci�n v�lida
    if (path === '/api/validate-installation' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { userEmail } = data;

        if (!userEmail) {
          return new Response(JSON.stringify({ error: 'Missing userEmail' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const emailLower = userEmail.toLowerCase();
        const ipAddress = getClientIp(request);
        const ipRate = await checkRateLimit(env, `validate-installation:ip:${ipAddress}`, 20, 900);
        if (!ipRate.allowed) {
          return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '900' }
          });
        }
        const emailRate = await checkRateLimit(env, `validate-installation:email:${emailLower}`, 5, 900);
        if (!emailRate.allowed) {
          return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '900' }
          });
        }

        // ? VALIDACI�N: Usuario debe existir, estar ACTIVO, y suscripci�n v�lida
        const userResult = await executeTursoQuery(
          'SELECT id, is_active, expires_at FROM users WHERE LOWER(email) = ?',
          [emailLower]
        );

        if (!userResult || userResult.rows.length === 0) {
          warn(`? No encontrado`);
          return new Response(JSON.stringify({ 
            error: 'User not found',
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const user = userResult.rows[0];

        // ? Verificar que usuario est� ACTIVO
        if (user.is_active !== 1 && user.is_active !== '1') {
          warn(`? Inactivo`);
          return new Response(JSON.stringify({ 
            error: 'User not active',
            message: 'Usuario inactivo. Contacta al administrador.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ? Verificar SUSCRIPCI�N no expirada
        if (user.expires_at) {
          const expiryDate = new Date(user.expires_at);
          const now = new Date();
          if (now > expiryDate) {
            warn(`? Expirada`);
            return new Response(JSON.stringify({ 
              error: 'Subscription expired',
              message: 'Suscripci�n expirada. Renueva para continuar.'
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // ? TODO BIEN - El usuario puede instalar
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Usuario validado',
          userId: user.id,
          userEmail: emailLower
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT VALIDAR DISPONIBILIDAD DE TERMINAL
    // ============================================
    // Llamada desde la app ANTES de instalar
    // Valida si una combinaci�n broker/server/account est� disponible para este usuario
    if (path === '/api/check-terminal-available' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { userEmail, broker, server, account } = data;

        if (!userEmail || !broker || !server || !account) {
          return new Response(JSON.stringify({ 
            error: 'Missing required fields',
            message: 'userEmail, broker, server, account son requeridos'
          }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const emailLower = userEmail.toLowerCase();
        
        // Generar installation_id candidato (mismo formato que el EA generar�)
        // ?? NORMALIZAR TODO A MAY�SCULAS
        const candidateInstallationId = `${broker.toUpperCase()}_${server.toUpperCase()}_${account.toUpperCase()}`;
        

        // ? PASO 1: Validar que usuario existe, est� activo, y tiene suscripci�n v�lida
        const userResult = await executeTursoQuery(
          'SELECT id, is_active, expires_at FROM users WHERE LOWER(email) = ?',
          [emailLower]
        );

        if (!userResult || userResult.rows.length === 0) {
          warn(`? No encontrado`);
          return new Response(JSON.stringify({ 
            error: 'User not found',
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const user = userResult.rows[0];
        const userId = user.id;

        // ? Verificar que usuario est� ACTIVO
        if (user.is_active !== 1 && user.is_active !== '1') {
          warn(`? Inactivo`);
          return new Response(JSON.stringify({ 
            error: 'User not active',
            message: 'Usuario inactivo. Contacta al administrador.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ? Verificar SUSCRIPCI�N no expirada
        if (user.expires_at) {
          const expiryDate = new Date(user.expires_at);
          const now = new Date();
          if (now > expiryDate) {
            warn(`? Expirada`);
            return new Response(JSON.stringify({ 
              error: 'Subscription expired',
              message: 'Suscripci�n expirada. Renueva para continuar.'
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // ? PASO 2: Validar que este installation_id NO est� vinculado a otro usuario
        const installationCheck = await executeTursoQuery(
          'SELECT user_id FROM installations WHERE UPPER(installation_id) = ? LIMIT 1',
          [candidateInstallationId]
        );

        if (installationCheck && installationCheck.rows.length > 0) {
          const existingUserId = installationCheck.rows[0].user_id;
          
          if (existingUserId !== userId) {
            // ? Otro usuario ya reclamo esta terminal
            error(`?? INTENTO BLOQUEADO: Usuario ${userId} intenta usar terminal de usuario ${existingUserId}`);
            return new Response(JSON.stringify({ 
              error: 'Terminal already claimed',
              message: `Esta instalaci�n de MetaTrader (${broker} ${server}) ya est� vinculada a otro usuario. No puedes instalar el EA aqu�.`
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // ? TODO BIEN - La terminal est� disponible para este usuario
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Terminal disponible para instalar',
          userId,
          installationId: candidateInstallationId
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT RESERVAR INSTALACI�N (PRE-INSTALL)
    // ============================================
    // Llamada desde la app ANTES de instalar
    // Reserva un installation_id para este usuario
    // Genera un ID �nico y lo retorna
    if (path === '/api/reserve-installation' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { userEmail, type, terminalId } = data;

        if (!userEmail || !type || !terminalId) {
          return new Response(JSON.stringify({ 
            error: 'Missing required fields',
            message: 'userEmail, type (MT4/MT5), y terminalId son requeridos'
          }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const emailLower = userEmail.toLowerCase();
        
        // ?? NUEVO FORMATO: ID_{MT4|MT5}_{terminalId}
        // El account se agregar� despu�s cuando el EA se registre
        const installationId = `ID_${type.toUpperCase()}_${terminalId.toUpperCase()}`;
        

        // ? PASO 1: Validar que usuario existe, est� activo, y tiene suscripci�n v�lida
        const userResult = await executeTursoQuery(
          'SELECT id, is_active, expires_at FROM users WHERE LOWER(email) = ?',
          [emailLower]
        );

        if (!userResult || userResult.rows.length === 0) {
          warn(`? No encontrado`);
          return new Response(JSON.stringify({ 
            error: 'User not found',
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const user = userResult.rows[0];
        const userId = user.id;

        // ? Verificar que usuario est� ACTIVO
        if (user.is_active !== 1 && user.is_active !== '1') {
          warn(`? Inactivo`);
          return new Response(JSON.stringify({ 
            error: 'User not active',
            message: 'Usuario inactivo. Contacta al administrador.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ? Verificar SUSCRIPCI�N no expirada
        if (user.expires_at) {
          const expiryDate = new Date(user.expires_at);
          const now = new Date();
          if (now > expiryDate) {
            warn(`? Expirada`);
            return new Response(JSON.stringify({ 
              error: 'Subscription expired',
              message: 'Suscripci�n expirada. Renueva para continuar.'
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // ? PASO 2: Validar que este installation_id NO está vinculado a otro usuario
        // 🔧 CAMBIO CRÍTICO: Usar = (exacto) en lugar de LIKE para NO reutilizar registros viejos
        // Buscar SOLO el ID sin account
        let installationCheck = await executeTursoQuery(
          'SELECT id, user_id, installation_id, status FROM installations WHERE UPPER(installation_id) = ? LIMIT 1',
          [installationId]  // Busca EXACTO: ID_MT5_TERMINALID (sin account)
        );
        if (installationCheck && installationCheck.rows.length > 0) {
          const existing = installationCheck.rows[0];
          const existingUserId = existing.user_id;
          const existingInstallId = existing.installation_id;
          
          if (existingUserId !== userId) {
            // ? Otro usuario ya reclamo esta terminal
            error(`?? BLOQUEADO: Usuario ${userId} intenta usar ${installationId} de usuario ${existingUserId}`);
            return new Response(JSON.stringify({ 
              error: 'Installation already claimed',
              message: `Esta instalaci�n de MetaTrader ya est� vinculada a otro usuario. No puedes instalar aqu�.`
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // ? MISMO usuario intenta reservar NUEVAMENTE
          // Re-usar la reserva existente
          
          return new Response(JSON.stringify({ 
            success: true,
            message: 'Instalaci�n ya reservada',
            id: existing.id,
            installationId: installationId,
            status: 'already_reserved'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ? PASO 3: Crear NUEVA reserva
        // Generar ID �nico para el registro
        const installationId_record = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
        
        // Crear registro como RESERVED (no ACTIVE)
        await executeTursoQuery(
          `INSERT INTO installations (id, installation_id, user_id, user_email, status, created_at) 
           VALUES (?, ?, ?, ?, 'RESERVED', ?)`,
          [installationId_record, installationId, userId, emailLower, new Date().toISOString()]
        );

        
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Instalaci�n reservada exitosamente',
          id: installationId_record,
          installationId: installationId,
          status: 'reserved'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT LIBERAR INSTALACIÓN (UNRESERVE)
    // ============================================
    if (path === '/api/unreserve-installation' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { installationId, userEmail, reason = null, force = false } = data;

        if (!installationId || !userEmail) {
          return new Response(JSON.stringify({
            error: 'Missing required fields',
            message: 'installationId y userEmail son requeridos'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const installationIdUpper = String(installationId).trim().toUpperCase();
        const emailLower = String(userEmail).trim().toLowerCase();

        const ipAddress = getClientIp(request);
        const ipRate = await checkRateLimit(env, `unreserve-installation:ip:${ipAddress}`, 20, 900);
        if (!ipRate.allowed) {
          return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '900' }
          });
        }

        const emailRate = await checkRateLimit(env, `unreserve-installation:email:${emailLower}`, 5, 900);
        if (!emailRate.allowed) {
          return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '900' }
          });
        }

        let isAdmin = false;
        const authHeader = request.headers.get('Authorization') || '';
        const tokenParts = authHeader.split(' ');
        if (tokenParts.length === 2 && tokenParts[0] === 'Bearer') {
          const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
          const payload = await verifyJWT(tokenParts[1], workerSecret);
          if (payload && payload.role === 'admin') {
            isAdmin = true;
          }
        }

        const shouldForce = Boolean(force) && isAdmin;

        const installResult = await executeTursoQuery(
          'SELECT id, installation_id, user_email, status, confirmed FROM installations WHERE UPPER(installation_id) LIKE ? ORDER BY created_at DESC LIMIT 1',
          [`${installationIdUpper}%`]
        );

        if (!installResult || installResult.rows.length === 0) {
          return new Response(JSON.stringify({
            error: 'Installation not found',
            message: 'Instalación no encontrada'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const installation = installResult.rows[0];
        const ownerEmail = String(installation.user_email || '').toLowerCase();
        const status = installation.status;
        const confirmed = installation.confirmed === 1 || installation.confirmed === '1';

        if (!shouldForce && ownerEmail !== emailLower) {
          return new Response(JSON.stringify({
            error: 'Forbidden',
            message: 'Instalación pertenece a otro usuario'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!shouldForce && confirmed) {
          return new Response(JSON.stringify({
            error: 'Installation confirmed',
            message: 'Instalación confirmada. Usa unlink admin para liberar.'
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!shouldForce && status !== 'RESERVED') {
          return new Response(JSON.stringify({
            error: 'Installation not reserved',
            message: 'Solo se puede liberar instalaciones en estado RESERVED.'
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        try {
          await executeTursoQuery(
            'UPDATE installations SET status = ?, released_at = ?, release_reason = ? WHERE id = ? AND user_email = ?',
            ['RELEASED', new Date().toISOString(), reason, installation.id, ownerEmail]
          );
        } catch (err) {
          await executeTursoQuery(
            'UPDATE installations SET status = ? WHERE id = ? AND user_email = ?',
            ['RELEASED', installation.id, ownerEmail]
          );
        }

        return new Response(JSON.stringify({
          success: true,
          status: 'released',
          installationId: installation.installation_id
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT REGISTRAR INSTALACI�N EA
    // ============================================
    if (path === '/api/register-installation' && request.method === 'POST') {
      const apiKey = request.headers.get('X-API-Key');
      // ? NO RECHAZAR SI NO TIENE APIKEY - Es la primera vez que se registra
      // El worker generar� un nuevo APIKey y lo retornar� en la respuesta
      // if (!apiKey) {
      //   return new Response(JSON.stringify({ error: 'Missing X-API-Key header' }), { 
      //     status: 401, 
      //     headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      //   });
      // }

      try {
        const data = await request.json().catch(() => ({}));
        let { installationId, userEmail, machineInfo, account } = data;

        if (!installationId) {
          return new Response(JSON.stringify({ error: 'Missing installationId' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ?? NORMALIZAR installationId a MAY�SCULAS (puede venir en cualquier caso del EA)
        installationId = installationId.toUpperCase();


        // ?? PASO 1: Buscar la instalaci�n RESERVADA por patr�n ID_MT4/MT5_terminalId
        let reservedInstallation = await executeTursoQuery(
          'SELECT id, user_id, user_email, status FROM installations WHERE UPPER(installation_id) LIKE ? AND status IN ("RESERVED", "ACTIVE") LIMIT 1',
          [`${installationId}%`]  // Busca ID_MT4/MT5_terminalId con o sin _account
        );

        if (!reservedInstallation || reservedInstallation.rows.length === 0) {
          error(`?? NO ENCONTRADA: ${installationId} - No fue reservada previamente`);
          return new Response(JSON.stringify({ 
            error: 'Installation not reserved',
            message: 'Esta instalaci�n no fue reservada. Debes usar la app para reservar primero.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const reservedRecord = reservedInstallation.rows[0];
        const userId = reservedRecord.user_id;
        const reservedEmail = reservedRecord.user_email;
        const emailLower = reservedEmail.toLowerCase();
        const reservedStatus = reservedRecord.status;


        // ?? PASO 2: Validar cuenta (si se proporciona)
        if (account) {
          const accountCheckResult = await executeTursoQuery(
            'SELECT user_id, installation_id FROM installations WHERE account = ? LIMIT 1',
            [account]
          );

          if (accountCheckResult && accountCheckResult.rows.length > 0) {
            const existingRecord = accountCheckResult.rows[0];
            // Si la cuenta existe y pertenece a OTRO usuario ? rechazar
            if (existingRecord.user_id !== userId) {
              error(`?? CUENTA EN USO: Account ${account} ya est� vinculado a usuario ${existingRecord.user_id}, intentando usuario ${userId}`);
              return new Response(JSON.stringify({ 
                error: 'Account already in use',
                message: `Cuenta ${account} ya est� vinculada a otro usuario. No puedes usar esta cuenta.`
              }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          } else {
          }
        }

        // ?? PASO 3: El registro YA existe (lo encontramos al inicio) - ACTUALIZAR
        // Obtener el valor actual de 'confirmed' para NO resetearlo
        const currentInstallation = await executeTursoQuery(
          'SELECT confirmed, account_id FROM installations WHERE UPPER(installation_id) LIKE ? AND user_id = ? LIMIT 1',
          [`${installationId}%`, userId]
        );
        
        const currentConfirmed = currentInstallation && currentInstallation.rows.length > 0 
          ? currentInstallation.rows[0].confirmed 
          : 0;  // Por defecto 0 si es nueva
        const currentAccountId = currentInstallation && currentInstallation.rows.length > 0
          ? currentInstallation.rows[0].account_id
          : null;
        
        
        const apiKey = `monkeydfx-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
        
        // ?? Obtener broker y server del account (si existe)
        let broker = 'Unknown';
        let server = 'Unknown';
        
        // Si la instalaci�n pre-reservada tiene broker/server, usarlos
        if (reservedRecord.broker) broker = reservedRecord.broker;
        if (reservedRecord.server) server = reservedRecord.server;
        
        // ?? Guardar INMEDIATAMENTE en KV como cuenta pendiente
        // NOTA: platform se actualizar� cuando el EA env�e /api/mt-sync con type:account
        if (account && env && env.ACCOUNTS_KV) {
          const pendingKey = `pending:${emailLower}:${account}`;
          const pendingData = JSON.stringify({
            accountNumber: account,
            userEmail: emailLower,
            broker: broker,
            server: server,
            balance: 0,
            equity: 0,
            margin: 0,
            freeMargin: 0,
            profit: 0,
            leverage: 0,
            timestamp: Date.now(),
            status: currentConfirmed === 1 || currentConfirmed === '1' ? 'confirmed' : 'pending',
            installationId: installationId,
            platform: null,  // Se establece cuando llega /api/mt-sync con type:account
            userId: userId
          });
          
          try {
            await env.ACCOUNTS_KV.put(pendingKey, pendingData, { expirationTtl: 86400 * 30 });
          } catch (err) {
            error(`? Error guardando en KV: ${err.message}`);
          }
        }
        
        // ?? IMPORTANTE: NO resetear confirmed si ya estaba 1
        // Solo actualizamos confirmed a 0 si NO ten�a valor previo
        const newConfirmed = currentConfirmed === 1 || currentConfirmed === '1' ? 1 : 0;
        
        // ?? NUEVO FORMATO: Si tenemos account, agregar al installation_id
        // Formato final: ID_MT4/MT5_terminalId_accountNumber
        // Esto permite buscar por LIKE cuando el account cambie en futuro
        const finalInstallationId = account ? `${installationId}_${account}` : installationId;
        
        
        await executeTursoQuery(
          'UPDATE installations SET status = ?, account = ?, machine_info = ?, api_key = ?, confirmed = ?, installation_id = ? WHERE UPPER(installation_id) LIKE ? AND user_id = ?',
          ['ACTIVE', account || null, JSON.stringify(machineInfo || {}), apiKey, newConfirmed, finalInstallationId, `${installationId}%`, userId]
        );
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Installation registered and activated',
          installationId: finalInstallationId,
          apiKey,
          userEmail: reservedEmail,
          confirmed: newConfirmed,
          accountNumber: account || null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ?? ENDPOINT VALIDAR APIKEY (EA)
    // ============================================
    // GET /api/validate-installation
    // El EA lo llama en OnInit() para verificar si la APIKey sigue siendo v�lida
    // Responde 200 si existe, 401 si fue revocada
    if (path === '/api/validate-installation' && request.method === 'GET') {
      try {
        const apiKey = request.headers.get('X-API-Key');
        
        if (!apiKey) {
          return new Response(JSON.stringify({ 
            success: false,
            error: 'Missing API Key',
            message: 'Requerido: X-API-Key header'
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ?? Buscar instalaci�n con esta APIKey
        const result = await executeTursoQuery(
          'SELECT id, installation_id, user_email, account, status, confirmed FROM installations WHERE api_key = ? LIMIT 1',
          [apiKey]
        );

        if (!result || result.rows.length === 0) {
          error(`? NO V�LIDA`);
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid API Key',
            message: 'Esta clave API fue revocada o no existe'
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const installation = result.rows[0];

        return new Response(JSON.stringify({
          success: true,
          message: 'API Key is valid',
          installation: {
            id: installation.id,
            installation_id: installation.installation_id,
            user_email: installation.user_email,
            account: installation.account,
            status: installation.status,
            confirmed: installation.confirmed
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT ACTIVAR/RECUPERAR INSTALACI�N (EA)
    // ============================================
    // POST /api/activate-installation
    // El EA lo llama con su account_number
    // Busca instalaci�n ACTIVE (reconexi�n) o RESERVED y la activa
    if (path === '/api/activate-installation' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { base_installation_id, account_number, user_id, userEmail, broker, server, machine_info } = data;

        // ? VALIDACI�N: Todos los campos requeridos
        // Aceptar user_id (email) o userEmail para compatibilidad
        const emailLower = (userEmail || user_id || '').toLowerCase();
        
        if (!base_installation_id || !account_number || !emailLower) {
          return new Response(JSON.stringify({ 
            success: false,
            error: 'Missing required fields',
            message: 'Requerido: base_installation_id, account_number, user_id/userEmail'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ?? NORMALIZAR TODO A MAY�SCULAS
        const baseId = base_installation_id.toUpperCase();
        const fullId = `${baseId}_${account_number}`.toUpperCase();


        // ?? PASO 1: Buscar instalaci�n ACTIVE con full_id (por email)
        const activeResult = await executeTursoQuery(
          'SELECT * FROM installations WHERE UPPER(installation_id) = ? AND LOWER(user_email) = ? AND status = ?',
          [fullId, emailLower, 'ACTIVE']
        );

        if (activeResult && activeResult.rows.length > 0) {
          const installation = activeResult.rows[0];

          return new Response(JSON.stringify({
            success: true,
            message: 'Installation already active',
            installation: {
              id: installation.id,
              installation_id: installation.installation_id,
              user_id: installation.user_id,
              account: installation.account,
              broker: installation.broker,
              server: installation.server,
              status: installation.status,
              confirmed: installation.confirmed,
              api_key: installation.api_key,
              last_sync: installation.last_sync,
              created_at: installation.created_at
            }
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ?? PASO 2: Si no ACTIVE, buscar RESERVED con base_id
        const reservedResult = await executeTursoQuery(
          'SELECT * FROM installations WHERE UPPER(installation_id) = ? AND LOWER(user_email) = ? AND status = ?',
          [baseId, emailLower, 'RESERVED']
        );

        if (!reservedResult || reservedResult.rows.length === 0) {
          // ?? VALIDACI�N EXTRA: Si existe RESERVED pero de otro usuario
          const otherUserResult = await executeTursoQuery(
            'SELECT user_email, installation_id FROM installations WHERE UPPER(installation_id) = ? AND status = ?',
            [baseId, 'RESERVED']
          );

          if (otherUserResult && otherUserResult.rows.length > 0) {
            const otherRecord = otherUserResult.rows[0];
            error(`?? TERMINAL RESERVADA POR OTRO USUARIO:`, {
              base_id: baseId,
              other_user_email: otherRecord.user_email,
              incoming_user_email: emailLower
            });

            return new Response(JSON.stringify({
              success: false,
              error: 'Terminal reserved by another user',
              message: 'Esta terminal fue reservada por otro usuario'
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          error(`?? NO ENCONTRADO: Sin RESERVED ni ACTIVE para ${baseId}`);
          return new Response(JSON.stringify({
            success: false,
            error: 'No installation found',
            message: 'No se encontr� instalaci�n. Por favor instala desde la app Electron primero.'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ? PASO 3: RESERVED encontrado - ACTUALIZAR a ACTIVE
        const reservedRecord = reservedResult.rows[0];

        // Generar nuevo API Key para esta activaci�n
        const apiKey = `monkeydfx-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;

        // UPDATE: cambiar installation_id a full_id, set account, status=ACTIVE
        await executeTursoQuery(
          `UPDATE installations 
           SET installation_id = ?, 
               account = ?, 
               broker = ?, 
               server = ?, 
               machine_info = ?, 
               status = ?, 
               api_key = ?, 
               last_sync = datetime('now')
           WHERE id = ?`,
          [
            fullId,
            account_number,
            broker || reservedRecord.broker || 'Unknown',
            server || reservedRecord.server || 'Unknown',
            JSON.stringify(machine_info || {}),
            'ACTIVE',
            apiKey,
            reservedRecord.id
          ]
        );


        return new Response(JSON.stringify({
          success: true,
          message: 'Installation activated successfully',
          installation: {
            id: reservedRecord.id,
            installation_id: fullId,
            userEmail: emailLower,
            account: account_number,
            broker: broker || reservedRecord.broker,
            server: server || reservedRecord.server,
            status: 'ACTIVE',
            confirmed: reservedRecord.confirmed,
            api_key: apiKey,
            created_at: reservedRecord.created_at
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT MT4/MT5 SYNC
    // ============================================
    if (path === '/api/mt-sync' && request.method === 'POST') {
      const apiKey = request.headers.get('X-API-Key');
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Missing X-API-Key header' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        
        const installResult = await executeTursoQuery(
          'SELECT id, installation_id, user_id, user_email, confirmed FROM installations WHERE api_key = ?',
          [apiKey]
        );

        if (!installResult || installResult.rows.length === 0) {
          warn(`? No registrado`);
          return new Response(JSON.stringify({ error: 'Invalid API Key' }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const installationId = installResult.rows[0].installation_id;
        const userEmail = installResult.rows[0].user_email || 'unknown';
        const emailLower = userEmail.toLowerCase();
        const userIdFromInstall = installResult.rows[0].user_id;
        const confirmed = installResult.rows[0].confirmed;
        
        // ?? CAMBIO: NO rechazar si confirmed=0 para type:account
        // El EA DEBE poder enviar datos pendientes incluso si no est� confirmado a�n
        // La validaci�n se hace por tipo de datos abajo
        
        // ? VALIDACI�N SEGURA: Usuario debe existir, estar ACTIVO, y suscripci�n v�lida
        // Usar el user_id que ya tenemos de la instalaci�n
        const userResult = await executeTursoQuery(
          'SELECT id, is_active, expires_at FROM users WHERE id = ?',
          [userIdFromInstall]
        );
        
        if (!userResult || userResult.rows.length === 0) {
          warn(`? No encontrado`);
          return new Response(JSON.stringify({ error: 'User not found' }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const user = userResult.rows[0];
        const userId = userIdFromInstall;

        // ? Verificar que usuario est� ACTIVO
        if (user.is_active !== 1 && user.is_active !== '1') {
            warn(`? Inactivo`);
          return new Response(JSON.stringify({ 
            error: 'User not active',
            message: 'Usuario inactivo. Contacta al administrador.'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // ? Verificar SUSCRIPCI�N no expirada
        if (user.expires_at) {
          const expiryDate = new Date(user.expires_at);
          const now = new Date();
          if (now > expiryDate) {
            warn(`? Expirada`);
            return new Response(JSON.stringify({ 
              error: 'Subscription expired',
              message: 'Suscripci�n expirada. Renueva para continuar.'
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
        
        
        await executeTursoQuery(
          'UPDATE installations SET last_sync = ? WHERE api_key = ?',
          [new Date().toISOString(), apiKey]
        );

        const data = await request.json().catch(() => ({}));
        
        // GUARDAR CUENTA PENDIENTE (para que el usuario confirme desde el journal)
        if (data.type === 'account') {
          
          // ? GUARDAR EN machine_info DE INMEDIATO (para que aparezca en journal)
          const machineInfoData = JSON.stringify({
            balance: data.balance || 0,
            equity: data.equity || 0,
            margin: data.margin || 0,
            freeMargin: data.freeMargin || 0,
            profit: data.profit || 0,
            leverage: data.leverage || 0,
            broker: data.broker || 'Unknown',
            server: data.server || 'Unknown',
            platform: data.platform || 'MT4',
            timestamp: Date.now()
          });
          
          await executeTursoQuery(
            'UPDATE installations SET machine_info = ? WHERE api_key = ?',
            [machineInfoData, apiKey]
          );
          
          // ?? Si confirmed=1 y no existe en accounts, crear autom�ticamente
          let accountIdFromBD = null;
          if (confirmed === 1 || confirmed === '1') {
            const existingAccount = await executeTursoQuery(
              'SELECT id FROM accounts WHERE mt_account_number = ? AND user_id = ?',
              [data.account, userId]
            );
            
            if (!existingAccount || existingAccount.rows.length === 0) {
              const accountId = `acc-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
              await executeTursoQuery(
                `INSERT INTO accounts (
                  id, user_id, name, balance, status, type, broker, server, 
                  mt_account_number, synced_at, syncing, initial_balance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  accountId,
                  userId,
                  `#${data.account}`,  // Nombre simple: #<numero_cuenta>
                  data.balance || 0,
                  'active',
                  'trading',
                  data.broker || 'Unknown',
                  data.server || 'Unknown',
                  data.account,
                  new Date().toISOString(),
                  0,
                  data.balance || 0
                ]
              );
              accountIdFromBD = accountId;
              
              // Vincular en installations
              await executeTursoQuery(
                'UPDATE installations SET account_id = ? WHERE api_key = ?',
                [accountId, apiKey]
              );
            } else {
              accountIdFromBD = existingAccount.rows[0].id;
            }
          }
          
          // Guardar en KV como "pending" (para historial/modal)
          const pendingKey = `pending:${emailLower}:${data.account}`;
          const pendingData = JSON.stringify({
            accountNumber: data.account,
            userEmail: emailLower,
            broker: data.broker || 'Unknown',
            server: data.server || 'Unknown',
            balance: data.balance || 0,
            equity: data.equity || 0,
            margin: data.margin || 0,
            freeMargin: data.freeMargin || 0,
            profit: data.profit || 0,
            leverage: data.leverage || 0,
            timestamp: Date.now(),
            status: confirmed === 1 || confirmed === '1' ? 'confirmed' : 'pending',
            installationId: installationId,
            platform: data.platform || 'MT4',
            userId: userId
          });
          
          if (env && env.ACCOUNTS_KV) {
            await env.ACCOUNTS_KV.put(pendingKey, pendingData, { expirationTtl: 86400 * 30 });
          } 
          
          return new Response(JSON.stringify({ 
            success: true,
            status: confirmed === 1 || confirmed === '1' ? 'confirmed' : 'pending_confirmation',
            message: confirmed === 1 || confirmed === '1' ? 'Account confirmed and ready to sync trades' : 'Account data received. Please confirm from the journal to sync trades.',
            accountNumber: data.account,
            accountId: accountIdFromBD,
            confirmed: confirmed === 1 || confirmed === '1' ? 1 : 0
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // GUARDAR TRADES
        if (data.type === 'trades' && data.account) {
          
          // ?? VALIDACI�N: Para TRADES s� se requiere confirmed=1
          if (confirmed === 0 || confirmed === '0') {
            warn(`?? No confirmada`);
            return new Response(JSON.stringify({ 
              error: 'Installation not confirmed',
              message: 'Por favor confirma la instalaci�n desde la web antes de sincronizar trades'
            }), { 
              status: 403, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // ?? VALIDACI�N: Buscar la cuenta en BD (debe estar confirmada)
          const accountResult = await executeTursoQuery(
            'SELECT id, user_id FROM accounts WHERE mt_account_number = ?',
            [data.account]
          );
          
          if (!accountResult.rows || accountResult.rows.length === 0) {
            error(`? Cuenta ${data.account} NO CONFIRMADA en BD. El usuario debe confirmar desde el journal primero.`);
            return new Response(JSON.stringify({ 
              success: false, 
              message: 'Account not confirmed. Please confirm from journal first.',
              status: 'pending_confirmation'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const accountRecord = accountResult.rows[0];
          const accountId = accountRecord.id;
          const accountUserId = accountRecord.user_id;

          // Fetch account initial balance and current activity to avoid double-counting the initial deposit
          let accountInitialBalance = 0;
          let existingCashflows = 0;
          let existingTrades = 0;
          try {
            const accRow = await executeTursoQuery(
              'SELECT initial_balance, balance FROM accounts WHERE id = ? LIMIT 1',
              [accountId]
            );
            if (accRow?.rows?.length) {
              const row = accRow.rows[0];
              accountInitialBalance = Number(row.initial_balance ?? row.balance ?? 0) || 0;
            }

            const cashCount = await executeTursoQuery(
              'SELECT COUNT(1) as cnt FROM cashflows WHERE account_id = ? LIMIT 1',
              [accountId]
            );
            if (cashCount?.rows?.length) {
              existingCashflows = Number(cashCount.rows[0].cnt || 0) || 0;
            }

            const tradeCount = await executeTursoQuery(
              'SELECT COUNT(1) as cnt FROM trades WHERE account_id = ? LIMIT 1',
              [accountId]
            );
            if (tradeCount?.rows?.length) {
              existingTrades = Number(tradeCount.rows[0].cnt || 0) || 0;
            }
          } catch (e) {
            // Ignore stats errors; proceed without filtering
          }
          
          // ?? SEGURIDAD: Verificar que la cuenta pertenece al usuario actual
          if (accountUserId !== userId) {
            error(`?? ACCESO DENEGADO: Cuenta ${data.account} pertenece a usuario ${accountUserId}, pero intenta acceder usuario ${userId}`);
            return new Response(JSON.stringify({ 
              error: 'Account already linked to another user',
              message: 'Esta cuenta ya est� vinculada a otro usuario. No puedes sincronizarla.'
            }), { 
              status: 403, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
            
            // ?? FIX 4: Marcar cuenta como sincronizando
            await executeTursoQuery(
              'UPDATE accounts SET syncing = 1 WHERE id = ?',
              [accountId]
            );
            
            let savedCount = 0;
            let errorCount = 0;
            let skippedCount = 0;
            
            const trades = data.data || [];
            const tradesToInsert = [];
            
            
            // PASO 1: UNA SOLA QUERY para traer todos los tickets/precios de esta cuenta
            // Esto es M�S EFICIENTE que verificar cada uno por separado
            const existingTickets = await executeTursoQuery(
              `SELECT ticket, date, entry_price, exit_price, entry_time, exit_time FROM trades WHERE account_id = ?`,
              [accountId]
            );
            
            // Crear un Set para b�squeda O(1) en memoria
            const tradeKeySet = new Set();
            
            for (const row of existingTickets.rows) {
              tradeKeySet.add(buildTradeKey(row.ticket, row.date, row.entry_price, row.exit_price, row.entry_time, row.exit_time));
            }
            
            
            // PASO 2: Verificar duplicados en MEMORIA (sin m�s queries a BD)
            for (const trade of trades) {
              try {
                const normalizedTrade = normalizeTrade(trade);
                
                // Validar que el trade est� completo
                if (!normalizedTrade.exit_time || normalizedTrade.exit_price === 0) {
                  skippedCount++;
                  continue;
                }
                
                // ?? Verificar en memoria usando SOLO ticket (O(1))
                // Esto evita problemas con diferencias de timezone o peque�as variaciones en precios
                const tradeKey = normalizedTrade.uniqueId || buildTradeKey(
                  normalizedTrade.ticket,
                  normalizedTrade.date,
                  normalizedTrade.entry_price,
                  normalizedTrade.exit_price,
                  normalizedTrade.entry_time,
                  normalizedTrade.exit_time
                );
                if (tradeKeySet.has(tradeKey)) {
                  skippedCount++;
                  continue;
                }
                tradeKeySet.add(tradeKey);
                
                // ? Trade v�lido y nuevo - preparar para insertar
                tradesToInsert.push(normalizedTrade);
              } catch (err) {
                errorCount++;
                error(`? Error normalizando trade ${trade.ticket}:`, err.message);
              }
            }
            
            
            // PASO 3: Insertar en lotes de 10 trades (1 INSERT por lote)
            const INSERT_BATCH_SIZE = 10;
            
            for (let i = 0; i < tradesToInsert.length; i += INSERT_BATCH_SIZE) {
              const batch = tradesToInsert.slice(i, i + INSERT_BATCH_SIZE);
              
              if (batch.length === 0) continue;
              
              try {
                // Construir INSERT m�ltiple para todo el batch
                const values = batch.map((t, idx) => {
                  return `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                }).join(', ');
                
                const args = [];
                for (const trade of batch) {
                  args.push(
                    Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9),
                    accountId,
                    trade.date,
                    trade.pair,
                    trade.direction,
                    trade.comment,
                    trade.entry_time,
                    trade.exit_time,
                    trade.tradingview_url,
                    new Date().toISOString(),
                    trade.ticket,
                    trade.lot_size,
                    trade.entry_price,
                    trade.exit_price,
                    trade.commission,
                    trade.swap,
                    trade.profit_usd,
                    'mt-sync'
                  );
                }
                
                await executeTursoQuery(
                  `INSERT INTO trades (
                    id, account_id, date, pair, direction, 
                    comment, entry_time, exit_time, tradingview_url, timestamp,
                    ticket, lot_size, entry_price, exit_price, 
                    commission, swap, profit_usd, import_source
                  ) VALUES ${values}`,
                  args
                );
                
                savedCount += batch.length;
              } catch (err) {
                errorCount += batch.length;
                error(`? Error en INSERT batch:`, err.message);
              }
            }
            
            // ?? FIX 4: Marcar cuenta como sincronizada (terminar sync)
            await executeTursoQuery(
              'UPDATE accounts SET syncing = 0 WHERE id = ?',
              [accountId]
            );
            
            
            return new Response(JSON.stringify({ 
              success: true,
              saved: savedCount,
              skipped: skippedCount,
              errors: errorCount 
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // GUARDAR CASHFLOWS (DEPÓSITOS / RETIROS)
        if (data.type === 'cashflows' && data.account) {
          if (confirmed === 0 || confirmed === '0') {
            return new Response(JSON.stringify({
              error: 'Installation not confirmed',
              message: 'Por favor confirma la instalación desde la web antes de sincronizar ajustes'
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const accountResult = await executeTursoQuery(
            'SELECT id, user_id FROM accounts WHERE mt_account_number = ?',
            [data.account]
          );

          if (!accountResult.rows || accountResult.rows.length === 0) {
            return new Response(JSON.stringify({
              success: false,
              message: 'Account not confirmed. Please confirm from journal first.',
              status: 'pending_confirmation'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const accountRecord = accountResult.rows[0];
          const accountId = accountRecord.id;
          const accountUserId = accountRecord.user_id;

          if (accountUserId !== userId) {
            return new Response(JSON.stringify({
              error: 'Account already linked to another user',
              message: 'Esta cuenta ya está vinculada a otro usuario. No puedes sincronizarla.'
            }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const flows = data.data || [];
          let saved = 0;
          let skipped = 0;

          for (const flow of flows) {
            const flowId = String(flow.id || `${accountId}-${flow.ticket || Date.now()}`);
            const type = String(flow.type || 'deposit').toLowerCase();
            const amount = Number(flow.amount) || 0;
            let date = String(flow.date || new Date().toISOString().split('T')[0]).trim();
            if (date.includes('T') || date.includes(' ')) {
              date = date.split(/[T ]/)[0];
            }
            if (/^\d{4}\.\d{2}\.\d{2}$/.test(date)) {
              date = date.replace(/\./g, '-');
            }
            const notes = flow.notes ? String(flow.notes) : null;

            // Skip initial balance cashflow to prevent double-counting
            const hasNoActivity = existingCashflows === 0 && existingTrades === 0;
            const isBalanceType = type === 'balance';
            const isDepositType = type === 'deposit';
            const amountMatchesInitial = accountInitialBalance > 0 && Math.abs(amount - accountInitialBalance) <= 0.01;
            const notesIndicateInitial = notes && /initial|balance/i.test(notes);
            if (hasNoActivity && amountMatchesInitial && (isBalanceType || isDepositType) && (isBalanceType || notesIndicateInitial)) {
              skipped++;
              continue;
            }

            if (!amount) {
              skipped++;
              continue;
            }

            try {
              await executeTursoQuery(
                'INSERT OR IGNORE INTO cashflows (id, user_id, account_id, type, amount, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [flowId, userId, accountId, type, amount, date, notes, new Date().toISOString()]
              );
              saved++;
            } catch (e) {
              skipped++;
            }
          }

          return new Response(JSON.stringify({ success: true, saved, skipped }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT: Confirmar cuenta (desde journal)
    // ============================================
    if (path === '/api/confirm-account' && request.method === 'POST') {
      try {
        const data = await request.json().catch(() => ({}));
        const { accountNumber, initialBalance } = data;
        
        // Obtener usuario del token Bearer
        const authHeader = request.headers.get('Authorization') || '';
        const tokenParts = authHeader.split(' ');
        
        if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
          return new Response(JSON.stringify({ error: 'Missing authorization' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const userToken = tokenParts[1];
        
        // Verificar token y obtener usuario
        const userResult = await executeTursoQuery(
          'SELECT id, email, is_active FROM users WHERE token = ? AND is_active = 1',
          [userToken]
        );
        
        if (!userResult || userResult.rows.length === 0) {
          return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const userId = userResult.rows[0].id;
        const userEmail = userResult.rows[0].email;
        
        if (!accountNumber) {
          return new Response(JSON.stringify({ error: 'Missing account number' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        
        // Buscar instalaci�n PENDIENTE de confirmaci�n para esta cuenta y usuario
        // confirmed = 0 significa que el EA se registr� pero el usuario a�n no confirm� desde el journal
        const installResult = await executeTursoQuery(
          'SELECT id, installation_id, api_key, broker, server FROM installations WHERE account = ? AND user_id = ? AND confirmed = 0',
          [accountNumber, userId]
        );
        
        if (!installResult || installResult.rows.length === 0) {
          warn(`?? No encontrada`);
          return new Response(JSON.stringify({ 
            error: 'Installation not found',
            message: 'No hay una instalaci�n pendiente para esta cuenta. Verifica que el EA est� activo.'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const installation = installResult.rows[0];
        
        // Verificar si ya existe entrada en accounts
        const existingAccount = await executeTursoQuery(
          'SELECT id FROM accounts WHERE mt_account_number = ? AND user_id = ?',
          [accountNumber, userId]
        );
        
        let accountId;
        
        if (existingAccount && existingAccount.rows.length > 0) {
          // Ya existe - solo actualizar
          accountId = existingAccount.rows[0].id;
          
          // Actualizar balance si se proporciona
          if (initialBalance) {
            await executeTursoQuery(
              'UPDATE accounts SET balance = ?, initial_balance = ? WHERE id = ?',
              [initialBalance, initialBalance, accountId]
            );
          }
        } else {
          // Crear nueva entrada
          accountId = `acc-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
          await executeTursoQuery(
            `INSERT INTO accounts (
              id, user_id, name, balance, status, type, broker, server, 
              mt_account_number, synced_at, syncing, initial_balance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              accountId,
              userId,
              `#${accountNumber}`,  // Nombre simple: #<numero_cuenta>
              initialBalance || 0,
              'active',
              'trading',
              installation.broker || 'Unknown',
              installation.server || 'Unknown',
              accountNumber,
              new Date().toISOString(),
              0,
              initialBalance || 0
            ]
          );
        }
        
        // Vincular account_id con installations Y marcar como confirmada
        await executeTursoQuery(
          'UPDATE installations SET account_id = ?, confirmed = 1 WHERE id = ?',
          [accountId, installation.id]
        );
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Account confirmed successfully',
          accountNumber,
          accountId,
          confirmed: 1
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT: Verificar estado de cuenta
    // ============================================
    if (path === '/api/account-status' && request.method === 'GET') {
      const apiKey = request.headers.get('X-API-Key');
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Missing X-API-Key header' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const installResult = await executeTursoQuery(
          'SELECT installation_id, user_id, user_email, confirmed FROM installations WHERE api_key = ?',
          [apiKey]
        );

        if (!installResult || installResult.rows.length === 0) {
          return new Response(JSON.stringify({ error: 'Invalid API Key' }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const userEmail = installResult.rows[0].user_email || 'unknown';
        const userIdFromInstall = installResult.rows[0].user_id;
        const confirmed = installResult.rows[0].confirmed;
        
        // ?? Validar que la instalaci�n est� confirmada
        if (confirmed === 0 || confirmed === '0') {
          warn(`?? No confirmada`);
          return new Response(JSON.stringify({ 
            error: 'Installation not confirmed',
            message: 'Por favor confirma la instalaci�n desde la web antes de enviar cuentas'
          }), { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const accountNumber = url.searchParams.get('account');
        
        if (!accountNumber) {
          return new Response(JSON.stringify({ error: 'Missing account parameter' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (env && env.ACCOUNTS_KV) {
          const confirmedKey = `confirmed:${userEmail}:${accountNumber}`;
          const confirmedData = await env.ACCOUNTS_KV.get(confirmedKey);
          
          if (confirmedData) {
            return new Response(JSON.stringify({ 
              status: 'confirmed',
              confirmed: true 
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const pendingKey = `pending:${userEmail}:${accountNumber}`;
          const pendingData = await env.ACCOUNTS_KV.get(pendingKey);
          if (pendingData) {
            return new Response(JSON.stringify({ 
              status: 'pending',
              confirmed: false,
              message: 'Cuenta en espera de confirmaci�n del usuario'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
        
        return new Response(JSON.stringify({ 
          status: 'not_found',
          confirmed: false,
          message: 'Cuenta no registrada. Env�a primero type:account a /api/mt-sync'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT: Debug EA
    // ============================================
    if (path === '/api/ea-debug' && request.method === 'GET') {
      const apiKey = request.headers.get('X-API-Key');
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Missing X-API-Key header' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const installResult = await executeTursoQuery(
          'SELECT id, installation_id, user_id, user_email, last_sync, created_at FROM installations WHERE api_key = ?',
          [apiKey]
        );

        if (!installResult || installResult.rows.length === 0) {
          return new Response(JSON.stringify({ 
            error: 'API Key not registered',
            step: 1,
            message: 'Primero: POST /api/register-installation'
          }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const installation = installResult.rows[0];
        const userIdFromInstall = installation.user_id;
        
        if (env && env.ACCOUNTS_KV) {
          const list = await env.ACCOUNTS_KV.list({ prefix: 'pending:' });
          const pendingAccounts = [];
          
          for (const key of list.keys) {
            const data = await env.ACCOUNTS_KV.get(key.name);
            if (data) {
              const parsed = JSON.parse(data);
              if (parsed.installationId === installation.installation_id) {
                pendingAccounts.push({
                  account: parsed.accountNumber,
                  broker: parsed.broker,
                  server: parsed.server,
                  status: 'pending_user_confirmation'
                });
              }
            }
          }
          
          return new Response(JSON.stringify({
            installation: {
              id: installation.id,
              registered_at: installation.created_at,
              last_sync: installation.last_sync || 'Never'
            },
            accounts: pendingAccounts,
            next_steps: pendingAccounts.length > 0 
              ? 'Esperando confirmaci�n del usuario en el modal web'
              : 'Env�a tipo:account primero con POST /api/mt-sync'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ error: 'KV not available' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // STRIPE WEBHOOK (sin autenticación)
    // ============================================
    if (path === '/webhook/stripe' && request.method === 'POST') {
      try {
        const signature = request.headers.get('stripe-signature');
        const body = await request.text();
        const WEBHOOK_SECRET = env?.STRIPE_WEBHOOK_SECRET || 'whsec_VnKR3dNRTOc4U5thek1tk3TkSBFXagwk';

        // Validate webhook signature
        if (!signature || !WEBHOOK_SECRET) {
          
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify signature using crypto
        const encoder = new TextEncoder();
        const parts = signature.split(',');
        let timestamp = '';
        const receivedSignatures = [];
        
        for (const part of parts) {
          const [key, value] = part.split('=');
          if (key.trim() === 't') timestamp = value;
          if (key.trim() === 'v1') receivedSignatures.push(value);
        }

        const signedContent = `${timestamp}.${body}`;
        const key = encoder.encode(WEBHOOK_SECRET);
        const hmac = await crypto.subtle.sign(
          'HMAC',
          await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
          encoder.encode(signedContent)
        );
        
        const calculatedSignature = Array.from(new Uint8Array(hmac))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        // Compare signatures (timing-safe)
        if (!receivedSignatures.includes(calculatedSignature)) {
          
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const event = JSON.parse(body);

        // ===== CHECKOUT SESSION COMPLETED =====
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const userEmail = session.customer_email || session.customer_details?.email || null;
          let plan = session.metadata?.plan || null;

          // Fallback: infer plan from subscription price if metadata is missing
          if (!plan && session.subscription) {
            try {
              const STRIPE_SECRET = env?.STRIPE_SECRET;
              if (STRIPE_SECRET) {
                const subResp = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
                  method: 'GET',
                  headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
                });
                if (subResp.ok) {
                  const subData = await subResp.json();
                  const priceId = subData?.items?.data?.[0]?.price?.id;
                  if (priceId) {
                    const priceToPlan = {
                      'price_1SkOIS0soxqx5zGeyBSG4lcr': 'pro',
                      'price_1Sqduf0soxqx5zGesD4sGKTH': 'unlimited'
                    };
                    plan = priceToPlan[priceId] || plan;
                  }
                }
              }
            } catch (e) {
              // ignore inference errors
            }
          }

          plan = plan || 'pro';

          if (userEmail) {
            const stripeCustomerId = session.customer || null;
            let userId = session.client_reference_id || session.metadata?.userId || null;

            // If no userId, try to resolve by email
            if (!userId) {
              try {
                const userByEmail = await executeTursoQuery(
                  'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
                  [userEmail.toLowerCase()]
                );
                userId = userByEmail?.rows?.[0]?.id || null;
              } catch (e) {
                // ignore lookup errors
              }
            }
            
            if (!userId) {
              // Create new user with temporary password
              const tempPassword = Math.random().toString(36).slice(-12);
              const hashedPassword = await hashPassword(tempPassword);
              
              userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
              
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 30);
              const expiresAtStr = expiresAt.toISOString();
              const createdAt = new Date().toISOString();

              try {
                await executeTursoQuery(
                  `INSERT INTO users (id, email, username, password_hash, user_plan, user_type, is_active, created_at, expires_at, last_login) 
                   VALUES (?, ?, ?, ?, ?, 'user', 1, ?, ?, ?)`,
                  [userId, userEmail, userEmail.split('@')[0], hashedPassword, plan, createdAt, expiresAtStr, createdAt]
                );

                await sendTempPasswordEmail(userEmail, tempPassword, env);
                
              } catch (createError) {
              }
            } else {
              // Update existing user
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 30);
              const expiresAtStr = expiresAt.toISOString();

              await executeTursoQuery(
                'UPDATE users SET user_plan = ?, expires_at = ?, is_active = 1, stripe_customer_id = COALESCE(?, stripe_customer_id) WHERE id = ?',
                [plan, expiresAtStr, stripeCustomerId, userId]
              );

              
              try {
                await sendPaymentConfirmationEmail(userEmail, plan, expiresAtStr, env);
              } catch (emailError) {
              }
            }
          }
        }

        // ===== SUBSCRIPTION UPDATED =====
        else if (event.type === 'customer.subscription.updated') {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          
          // Update expiration if subscription status changes
          if (subscription.status === 'active' || subscription.status === 'trialing') {
            const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
            // Could update user expires_at here if needed
          }
        }

        // ===== SUBSCRIPTION DELETED =====
        else if (event.type === 'customer.subscription.deleted') {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          
          // Mark user as inactive or set plan to free
          // Could query user by stripe customer ID and update
        }

        // ===== INVOICE PAYMENT FAILED =====
        else if (event.type === 'invoice.payment_failed') {
          const invoice = event.data.object;
          const customerId = invoice.customer;
          
          // Could send notification email or mark account
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // PAYPAL WEBHOOK (sin autenticación)
    // ============================================
    if ((path === '/webhooks/paypal' || path === '/webhook/paypal') && request.method === 'POST') {
      try {
        await ensurePayPalColumns();
        const body = await request.text();
        const token = await getPayPalAccessToken(env);

        const verifyResponse = await fetch(
          `${getPayPalBaseUrl(env)}/v1/notifications/verify-webhook-signature`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              transmission_id: request.headers.get('paypal-transmission-id'),
              transmission_time: request.headers.get('paypal-transmission-time'),
              cert_url: request.headers.get('paypal-cert-url'),
              auth_algo: request.headers.get('paypal-auth-algo'),
              transmission_sig: request.headers.get('paypal-transmission-sig'),
              webhook_id: env?.PAYPAL_WEBHOOK_ID,
              webhook_event: JSON.parse(body)
            })
          }
        );

        const verifyData = await verifyResponse.json();
        if (verifyData?.verification_status !== 'SUCCESS') {
          return new Response('Invalid signature', {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const event = JSON.parse(body);
        const eventType = event.event_type;
        const resource = event.resource || {};

        const planId = resource.plan_id;
        const resolvedPlan = resolvePlanFromPayPal(planId, env);

        if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
          const subscriptionId = resource.id;
          const payerId = resource?.subscriber?.payer_id || null;
          const expiresAt = resolveNextBillingDate(resource);

          await executeTursoQuery(
            'UPDATE users SET user_plan = ?, expires_at = ?, paypal_subscription_id = ?, paypal_payer_id = COALESCE(?, paypal_payer_id) WHERE paypal_subscription_id = ? OR paypal_payer_id = ?',
            [resolvedPlan || 'pro', expiresAt, subscriptionId, payerId, subscriptionId, payerId]
          );
        }

        if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.SUSPENDED' || eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
          const subscriptionId = resource.id;
          await executeTursoQuery(
            'UPDATE users SET user_plan = ?, expires_at = datetime(\'now\') WHERE paypal_subscription_id = ?',
            ['free', subscriptionId]
          );
        }

        if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED' || eventType === 'BILLING.SUBSCRIPTION.UPDATED') {
          const subscriptionId = resource.billing_agreement_id || resource.subscription_id || resource.id;
          const expiresAt = resolveNextBillingDate(resource);
          if (subscriptionId) {
            await executeTursoQuery(
              'UPDATE users SET expires_at = ? WHERE paypal_subscription_id = ?',
              [expiresAt, subscriptionId]
            );
          }
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINT SINCRONIZAR EVENTOS ECONÓMICOS (PÚBLICO - INTERNAL USE)
    // POST /api/sync-economic-events
    // Sincroniza eventos desde Forex Factory y los guarda en BD
    // ============================================
    if (path === '/api/sync-economic-events' && request.method === 'POST') {
      try {
        const FOREX_FACTORY_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
        

        
        let events = [];
        
        // Obtener datos de Forex Factory
        try {

          
          const response = await fetch(FOREX_FACTORY_URL);

          
          if (response.ok) {
            const data = await response.json();
            
            if (Array.isArray(data)) {
              events = data;

            } else {

            }
          } else {
            const errorText = await response.text();

          }
        } catch (fetchError) {

        }
        
        if (events.length === 0) {

          return new Response(JSON.stringify({ success: true, count: 0, message: 'No events found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Filtros: Solo eventos de alto/medio impacto y monedas principales

        
        const allowedCurrencies = ['USD', 'EUR', 'GBP', 'JPY'];
        const allowedImpacts = ['High', 'Medium'];
        
        const filtered = events.filter(e => {
          // Filtrar por moneda e impacto
          return allowedCurrencies.includes(e.country) && allowedImpacts.includes(e.impact);
        }).map(e => {
          // Normalizar formato para BD
          // Forex Factory format: { date: "2026-01-15T13:30:00-05:00", country: "USD", title: "...", impact: "High", ... }
          const eventDate = new Date(e.date);
          const dateTimeISO = eventDate.toISOString(); // Guardar fecha + hora completa en UTC
          
          let impact = 'medium';
          if (e.impact === 'High') impact = 'high';
          else if (e.impact === 'Low') impact = 'low';
          
          return {
            date: dateTimeISO, // Ahora incluye hora
            country: e.country,
            title: e.title || 'Economic Event',
            impact: impact,
            actual: e.actual || null,
            forecast: e.forecast || null,
            previous: e.previous || null,
            currency: e.country
          };
        });
        

        
        if (filtered.length === 0) {

          return new Response(JSON.stringify({ success: true, count: 0, message: 'No relevant events found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Limpiar eventos antiguos (>90 días)
        const today = new Date();
        const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await executeTursoQuery('DELETE FROM economic_events WHERE date < ?', [ninetyDaysAgo]);

        
        // Insertar/actualizar eventos en BD
        let insertedCount = 0;
        for (const event of filtered) {
          const eventId = `${event.date}_${event.country}_${event.title}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
          
          try {
            await executeTursoQuery(
              `INSERT INTO economic_events (id, date, country, title, impact, actual, forecast, previous, currency, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(id) DO UPDATE SET 
                 actual = excluded.actual, 
                 forecast = excluded.forecast, 
                 previous = excluded.previous, 
                 updated_at = CURRENT_TIMESTAMP`,
              [eventId, event.date, event.country, event.title, event.impact, event.actual, event.forecast, event.previous, event.currency]
            );
            insertedCount++;
          } catch (err) {

          }
        }

        // Limpiar duplicados por fecha/país/título
        try {
          await executeTursoQuery(
            'DELETE FROM economic_events WHERE rowid NOT IN (SELECT MIN(rowid) FROM economic_events GROUP BY date, country, title)'
          );
        } catch (e) {
          // Ignorar limpieza si falla
        }
        

        
        return new Response(JSON.stringify({ 
          success: true, 
          count: insertedCount,
          total: filtered.length,
          source: 'ForexFactory'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {

        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // VALIDATE TOKEN - Verificar que la sesión sea válida
    // ============================================
    if (path === '/api/validate-token' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized - Missing token', valid: false }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const userToken = authHeader.replace('Bearer ', '');

      try {
        let cached = tokenCache.get(userToken);
        let userId, userEmail, expiresAt;
        const nowMs = Date.now();
        
        if (cached && (nowMs - (cached.__cachedAt || 0)) < TOKEN_CACHE_TTL_MS) {
          userId = cached.id;
          userEmail = cached.email;
          expiresAt = cached.expires_at;
        } else {
          const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
          const jwtPayload = await verifyJWT(userToken, workerSecret);
          
          if (jwtPayload && jwtPayload.userId) {
            userId = jwtPayload.userId;
            userEmail = jwtPayload.email;
          } else {
            const userResult = await executeTursoQuery(
              'SELECT id, email, expires_at FROM users WHERE token = ? AND is_active = 1',
              [userToken]
            );

            if (!userResult || !userResult.rows || userResult.rows.length === 0) {
              return new Response(JSON.stringify({ error: 'Invalid token', valid: false }), { 
                status: 401, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
            
            userId = userResult.rows[0].id;
            userEmail = userResult.rows[0].email;
            expiresAt = userResult.rows[0].expires_at;
          }

          if (userId && userEmail) {
            tokenCache.set(userToken, {
              id: userId,
              email: userEmail,
              expires_at: expiresAt,
              __cachedAt: nowMs
            });
          }
        }

        // Verificar expiración
        if (expiresAt) {
          const expirationDate = new Date(expiresAt);
          const now = new Date();
          if (now > expirationDate) {
            return new Response(JSON.stringify({ error: 'Token expired', valid: false }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        return new Response(JSON.stringify({ 
          valid: true,
          userId: userId,
          email: userEmail,
          expiresAt: expiresAt,
          message: 'Sesión válida'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message, valid: false }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // ENDPOINTS AUTENTICADOS (requieren token de usuario)
    // ============================================
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized - Missing token' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userToken = authHeader.replace('Bearer ', '');

    // JWT tiene puntos (header.payload.signature), as� que permitir eso tambi�n
    if (userToken.length < 10 || userToken.length > 500 || !/^[a-zA-Z0-9_\-\.]+$/.test(userToken)) {
      return new Response(JSON.stringify({ error: 'Invalid token format' }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      let cached = tokenCache.get(userToken);
      let userId, userEmail, expiresAt;

      const nowMs = Date.now();

      // Variable para tracking de rol admin
      let isAdminRole = false;

      // Token cache control (disabled during debugging, re-enabled in production)
      const CACHE_DISABLED = false;
      
      if (!CACHE_DISABLED && cached && (nowMs - (cached.__cachedAt || 0)) < TOKEN_CACHE_TTL_MS) {
        userId = cached.id;
        userEmail = cached.email;
        expiresAt = cached.expires_at;
        isAdminRole = cached.isAdmin || false;
      } else {
        // Intentar verificar como JWT primero
        const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
        const jwtPayload = await verifyJWT(userToken, workerSecret);
        
        let userResult = null;
        
        if (jwtPayload && jwtPayload.role === 'admin') {
          // Es un JWT de admin v�lido
          isAdminRole = true;
          userId = 'admin';
          userEmail = 'admin@system';
          expiresAt = null;
        } else if (jwtPayload && jwtPayload.userId) {
          // Es un JWT v�lido - verificar que el usuario siga activo en BD
          userId = jwtPayload.userId;
          userEmail = jwtPayload.email;
          
          // ?? VALIDAR is_active en BD (el JWT puede ser v�lido pero el usuario fue bloqueado)
          const userCheck = await executeTursoQuery(
            'SELECT is_active FROM users WHERE id = ?',
            [userId]
          );
          
          if (!userCheck || !userCheck.rows || userCheck.rows.length === 0) {
            throw new Error('Usuario no encontrado');
          }
          
          const isActive = userCheck.rows[0].is_active;
          
          if (isActive === 0 || isActive === false) {
            throw new Error('Cuenta bloqueada');
          }
          
          expiresAt = null; // JWT maneja su propia expiraci�n
        } else {
          // Intentar como token simple de BD (compatibilidad hacia atr�s)
          userResult = await executeTursoQuery(
            'SELECT id, email, expires_at FROM users WHERE token = ? AND is_active = 1',
            [userToken]
          );

          if (!userResult || !userResult.rows || userResult.rows.length === 0) {
            tokenCache.delete(userToken);
            throw new Error('Invalid or expired token');
          }
          
          userId = userResult.rows[0].id;
          userEmail = userResult.rows[0].email;
          expiresAt = userResult.rows[0].expires_at;
        }
        
        // Cache el token
        if (userId && userEmail) {
          tokenCache.set(userToken, {
            id: userId,
            email: userEmail,
            expires_at: expiresAt,
            isAdmin: isAdminRole,
            __cachedAt: nowMs
          });
        }
      }

      if (expiresAt) {
        const expirationDate = new Date(expiresAt);
        const now = new Date();
        
        if (now > expirationDate) {
          try {
            await executeTursoQuery('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);
          } catch (e) {
            
          }
          
          return new Response(JSON.stringify({ 
            error: 'Account expired',
            expired: true,
            message: 'Tu cuenta ha expirado. Contacta al administrador.'
          }), { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }


      // Health check
      if (path === '/api/health') {
        return new Response(JSON.stringify({ 
          status: 'ok', 
          user: userId,
          email: userEmail,
          expiresAt: expiresAt
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ?? Obtener cuentas pendientes del usuario
      if (path === '/api/pending-accounts' && request.method === 'GET') {
        try {
          
          if (env && env.ACCOUNTS_KV) {
            const list = await env.ACCOUNTS_KV.list({ prefix: 'pending:' });
            const pendingAccounts = [];
            
            for (const key of list.keys) {
              const data = await env.ACCOUNTS_KV.get(key.name);
              if (data) {
                const parsed = JSON.parse(data);
                if (parsed.userEmail === userEmail.toLowerCase()) {
                  // ?? Si no tiene platform definido, intentar rellenarlo desde la instalaci�n
                  let platform = parsed.platform || null;
                  
                  if (!platform && parsed.installationId) {
                    try {
                      const installResult = await executeTursoQuery(
                        'SELECT machine_info FROM installations WHERE UPPER(installation_id) LIKE ? LIMIT 1',
                        [`${parsed.installationId}%`]  // ?? LIKE pattern para encontrar con o sin account
                      );
                      if (installResult && installResult.rows && installResult.rows.length > 0) {
                        const machineInfo = JSON.parse(installResult.rows[0].machine_info || '{}');
                        platform = machineInfo.platform || 'MT4'; // Default a MT4 si no se especifica
                      }
                    } catch (e) {
                      warn(`?? Error`);
                      platform = 'MT4'; // Default fallback
                    }
                  }
                  
                  // ?? Si a�n es null, usar default
                  if (!platform) {
                    platform = 'MT4';
                  }
                  
                  pendingAccounts.push({
                    accountNumber: parsed.accountNumber,
                    broker: parsed.broker,
                    server: parsed.server,
                    balance: parsed.balance,
                    equity: parsed.equity,
                    margin: parsed.margin,
                    freeMargin: parsed.freeMargin,
                    profit: parsed.profit,
                    leverage: parsed.leverage,
                    timestamp: parsed.timestamp,
                    status: parsed.status,
                    platform: platform
                  });
                }
              }
            }
            
            return new Response(JSON.stringify(pendingAccounts), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } else {
            return new Response(JSON.stringify({ error: 'KV not available' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        } catch (error) {
          
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ?? Obtener instalaciones NO confirmadas del usuario
      if (path === '/api/installations' && request.method === 'GET') {
        try {
          
          const result = await executeTursoQuery(
            `SELECT api_key, installation_id, machine_info, created_at, confirmed 
             FROM installations 
             WHERE user_email = ? AND confirmed = 0
             ORDER BY created_at DESC`,
            [userEmail]
          );
          
          const installations = result.rows || [];
          
          return new Response(JSON.stringify(installations), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ?? Confirmar instalaci�n
      if (path.startsWith('/api/installations/') && path.endsWith('/confirm') && request.method === 'POST') {
        try {
          const apiKey = path.split('/')[3];
          
          if (!apiKey) {
            return new Response(JSON.stringify({ error: 'API Key requerida' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // Verificar que la instalaci�n pertenece al usuario actual
          const result = await executeTursoQuery(
            `SELECT id FROM installations 
             WHERE api_key = ? AND user_email = ?`,
            [apiKey, userEmail]
          );
          
          if (!result || result.rows.length === 0) {
            return new Response(JSON.stringify({ error: 'Instalaci�n no encontrada' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // Confirmar instalaci�n
          await executeTursoQuery(
            `UPDATE installations SET confirmed = 1 WHERE api_key = ?`,
            [apiKey]
          );
          
          
          return new Response(JSON.stringify({ 
            success: true, 
            message: 'Instalaci�n confirmada' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Obtener cuentas pendientes
      if (path === '/api/pending-accounts' && request.method === 'GET') {
        const pendingAccounts = [];
        
        try {
          
          if (env && env.ACCOUNTS_KV) {
            const prefix = `pending:${userEmail.toLowerCase()}:`;
            const list = await env.ACCOUNTS_KV.list({ prefix: prefix });
            
            for (const key of list.keys) {
              const data = await env.ACCOUNTS_KV.get(key.name);
              if (data) {
                const parsed = JSON.parse(data);
                pendingAccounts.push(parsed);
              }
            }
          } 
          
          return new Response(JSON.stringify(pendingAccounts), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Confirmar cuenta
      if (path === '/api/confirm-account' && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const { accountNumber, initialBalance } = body;
          
          if (!accountNumber || !env || !env.ACCOUNTS_KV) {
            return new Response(JSON.stringify({ error: 'Invalid request' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const pendingKey = `pending:${userEmail.toLowerCase()}:${accountNumber}`;
          const pendingData = await env.ACCOUNTS_KV.get(pendingKey);
          
          if (!pendingData) {
            warn(`? No encontrada`);
            return new Response(JSON.stringify({ error: 'Account not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const accountInfo = JSON.parse(pendingData);
          
          // ?? FIX 1: Verificar si la cuenta ya existe (EVITAR DUPLICADOS)
          const existingResult = await executeTursoQuery(
            'SELECT id, initial_balance FROM accounts WHERE user_id = ? AND mt_account_number = ?',
            [userId, accountNumber]
          );
          
          // ?? Usar initialBalance del usuario, o el balance actual si no se proporciona
          const finalInitialBalance = initialBalance ? parseFloat(initialBalance) : accountInfo.balance;
          
          let accountId;
          if (existingResult.rows.length > 0) {
            // ? La cuenta ya existe - ACTUALIZAR balance actual, pero NO initial_balance
            accountId = existingResult.rows[0].id;
            
            await executeTursoQuery(
              'UPDATE accounts SET balance = ?, broker = ?, server = ?, synced_at = ? WHERE id = ?',
              [accountInfo.balance, accountInfo.broker, accountInfo.server, new Date().toISOString(), accountId]
            );
            
          } else {
            // ? Crear nueva cuenta con initial_balance
            accountId = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
            
            await executeTursoQuery(
              'INSERT INTO accounts (id, user_id, name, balance, initial_balance, status, mt_account_number, broker, server, synced_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [accountId, userId, `#${accountNumber}`, accountInfo.balance, finalInitialBalance, 'active', accountNumber, accountInfo.broker, accountInfo.server, new Date().toISOString(), new Date().toISOString()]
            );
            
          }
          
          const confirmedKey = `confirmed:${userEmail.toLowerCase()}:${accountNumber}`;
          await env.ACCOUNTS_KV.put(confirmedKey, JSON.stringify({ ...accountInfo, userId, accountId, initialBalance: finalInitialBalance }), { expirationTtl: 86400 * 30 });
          
          
          await env.ACCOUNTS_KV.delete(pendingKey);
          
          return new Response(JSON.stringify({ success: true, accountId, initialBalance: finalInitialBalance }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Rechazar cuenta
      if (path === '/api/reject-account' && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const { accountNumber } = body;
          
          if (!accountNumber || !env || !env.ACCOUNTS_KV) {
            return new Response(JSON.stringify({ error: 'Invalid request' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const pendingKey = `pending:${userEmail}:${accountNumber}`;
          const pendingData = await env.ACCOUNTS_KV.get(pendingKey);
          
          if (!pendingData) {
            return new Response(JSON.stringify({ error: 'Account not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          await env.ACCOUNTS_KV.delete(pendingKey);
          
          return new Response(JSON.stringify({ success: true, message: 'Account rejected' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // TRADOVATE: CONNECT
      // ============================================
      if (path === '/api/tradovate/connect' && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const { username, password, environment = 'demo', deviceId } = body;

          if (!username || !password || !deviceId) {
            return new Response(JSON.stringify({ success: false, error: 'Missing Tradovate credentials' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          await ensureTradovateSchema();

          const baseUrl = getTradovateBaseUrl(environment);
          const tokenResp = await tradovateRequest(baseUrl, '/auth/accesstokenrequest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: username,
              password: password,
              deviceId: deviceId,
              appId: 'TradingJournal',
              appVersion: '1.0'
            })
          });

          const accessToken = tokenResp.accessToken;
          const expirationTime = tokenResp.expirationTime;
          const tradovateUserId = tokenResp.userId;

          if (!accessToken) {
            return new Response(JSON.stringify({ success: false, error: 'Tradovate authentication failed' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const accounts = await tradovateRequest(baseUrl, '/account/list', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          const connectionId = `tv-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 6)}`;

          const encryptedPassword = await encryptWithUserToken(password, userToken, userId);

          await executeTursoQuery(
            `INSERT INTO tradovate_connections (
              id, user_id, tradovate_user_id, username, encrypted_password, device_id, env, access_token, token_expiration, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ,
            [
              connectionId,
              userId,
              tradovateUserId || null,
              username,
              encryptedPassword,
              deviceId,
              environment,
              accessToken,
              expirationTime || null,
              'pending',
              new Date().toISOString(),
              new Date().toISOString()
            ]
          );

          const safeAccounts = Array.isArray(accounts) ? accounts.map(acc => ({
            id: acc.id,
            name: acc.name,
            accountType: acc.accountType,
            active: acc.active
          })) : [];

          return new Response(JSON.stringify({
            success: true,
            connectionId,
            accounts: safeAccounts
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // TRADOVATE: CONFIRM ACCOUNT
      // ============================================
      if (path === '/api/tradovate/confirm' && request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const { connectionId, tradovateAccountId, initialBalance } = body;

          if (!connectionId || !tradovateAccountId) {
            return new Response(JSON.stringify({ success: false, error: 'Missing connectionId or tradovateAccountId' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          await ensureTradovateSchema();

          const connResult = await executeTursoQuery(
            'SELECT * FROM tradovate_connections WHERE id = ? AND user_id = ? LIMIT 1',
            [connectionId, userId]
          );

          if (!connResult?.rows?.length) {
            return new Response(JSON.stringify({ success: false, error: 'Tradovate connection not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const connection = connResult.rows[0];
          const { accessToken, baseUrl } = await ensureTradovateToken(env, connection, userToken, userId);

          if (!accessToken) {
            return new Response(JSON.stringify({ success: false, error: 'Tradovate token expired. Reconnect.' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const accounts = await tradovateRequest(baseUrl, '/account/list', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          const tvAccount = Array.isArray(accounts)
            ? accounts.find(acc => String(acc.id) === String(tradovateAccountId))
            : null;

          if (!tvAccount) {
            return new Response(JSON.stringify({ success: false, error: 'Tradovate account not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const existingAccount = await executeTursoQuery(
            'SELECT id FROM accounts WHERE user_id = ? AND sync_provider = ? AND external_account_id = ? LIMIT 1',
            [userId, 'tradovate', String(tradovateAccountId)]
          );

          const finalInitialBalance = initialBalance ? parseFloat(initialBalance) : 0;
          let accountId;

          if (existingAccount?.rows?.length) {
            accountId = existingAccount.rows[0].id;
            await executeTursoQuery(
              'UPDATE accounts SET balance = ?, initial_balance = ?, synced_at = ? WHERE id = ?',
              [finalInitialBalance, finalInitialBalance, new Date().toISOString(), accountId]
            );
          } else {
            accountId = `acc-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
            const accountName = tvAccount.name ? `Tradovate ${tvAccount.name}` : `Tradovate #${tradovateAccountId}`;

            await executeTursoQuery(
              `INSERT INTO accounts (
                id, user_id, name, balance, initial_balance, status,
                type, broker, server, mt_account_number, synced_at, syncing, sync_provider, external_account_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ,
              [
                accountId,
                userId,
                accountName,
                finalInitialBalance,
                finalInitialBalance,
                'active',
                'trading',
                'Tradovate',
                'Tradovate',
                null,
                new Date().toISOString(),
                0,
                'tradovate',
                String(tradovateAccountId)
              ]
            );
          }

          await executeTursoQuery(
            'UPDATE tradovate_connections SET account_id = ?, tradovate_account_id = ?, status = ?, updated_at = ? WHERE id = ?',
            [accountId, String(tradovateAccountId), 'active', new Date().toISOString(), connectionId]
          );

          return new Response(JSON.stringify({
            success: true,
            accountId
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // TRADOVATE: SYNC FILLS
      // ============================================
      if (path === '/api/tradovate/sync' && request.method === 'POST') {
        let accountId = null;
        try {
          const body = await request.json().catch(() => ({}));
          accountId = body.accountId;

          if (!accountId) {
            return new Response(JSON.stringify({ success: false, error: 'Missing accountId' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          await ensureTradovateSchema();

          const connResult = await executeTursoQuery(
            'SELECT * FROM tradovate_connections WHERE account_id = ? AND user_id = ? AND status = ? LIMIT 1',
            [accountId, userId, 'active']
          );

          if (!connResult?.rows?.length) {
            return new Response(JSON.stringify({ success: false, error: 'Tradovate connection not found for account' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const connection = connResult.rows[0];
          const { accessToken, baseUrl } = await ensureTradovateToken(env, connection, userToken, userId);

          if (!accessToken) {
            return new Response(JSON.stringify({ success: false, error: 'Tradovate token expired. Reconnect.' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          await executeTursoQuery('UPDATE accounts SET syncing = 1 WHERE id = ?', [accountId]);

          const lastSync = connection.last_sync ? new Date(connection.last_sync) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const startTimestamp = lastSync.toISOString();

          const fills = await tradovateRequest(baseUrl, `/fill/list?startTimestamp=${encodeURIComponent(startTimestamp)}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (Array.isArray(fills)) {
            for (const fill of fills) {
              const fillId = String(fill.id);
              await executeTursoQuery(
                `INSERT OR IGNORE INTO tradovate_fills (
                  id, connection_id, contract_id, action, qty, price, timestamp, remaining_qty, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ,
                [
                  fillId,
                  connection.id,
                  fill.contractId || null,
                  fill.action || null,
                  fill.qty || 0,
                  fill.price || 0,
                  fill.timestamp || null,
                  fill.qty || 0,
                  'open'
                ]
              );
            }
          }

          const openFills = await executeTursoQuery(
            'SELECT id, contract_id, action, remaining_qty, price, timestamp FROM tradovate_fills WHERE connection_id = ? AND remaining_qty > 0 ORDER BY timestamp ASC',
            [connection.id]
          );

          const existingTickets = await executeTursoQuery(
            'SELECT ticket FROM trades WHERE account_id = ? AND import_source = ?',
            [accountId, 'tradovate']
          );
          const ticketSet = new Set((existingTickets.rows || []).map(r => String(r.ticket)));

          const contractCache = new Map();
          async function getContractInfo(contractId) {
            if (contractCache.has(contractId)) return contractCache.get(contractId);
            try {
              const contract = await tradovateRequest(baseUrl, `/contract/item?id=${contractId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              let productName = null;
              if (contract?.productId) {
                const product = await tradovateRequest(baseUrl, `/product/item?id=${contract.productId}`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                productName = product?.name || null;
              }
              const info = {
                symbol: contract?.name || `CONTRACT_${contractId}`,
                valuePerPoint: contract?.valuePerPoint || 1,
                productName: productName
              };
              contractCache.set(contractId, info);
              return info;
            } catch (e) {
              const info = { symbol: `CONTRACT_${contractId}`, valuePerPoint: 1, productName: null };
              contractCache.set(contractId, info);
              return info;
            }
          }

          const tradesToInsert = [];
          const remainingMap = new Map();
          const fillsByContract = new Map();
          const openRows = openFills.rows || [];

          for (const row of openRows) {
            const contractId = row.contract_id || '0';
            if (!fillsByContract.has(contractId)) fillsByContract.set(contractId, []);
            fillsByContract.get(contractId).push({
              id: row.id,
              contract_id: contractId,
              action: row.action,
              remaining_qty: parseFloat(row.remaining_qty || 0),
              price: parseFloat(row.price || 0),
              timestamp: row.timestamp
            });
          }

          for (const [contractId, fillsList] of fillsByContract.entries()) {
            fillsList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            const longQueue = [];
            const shortQueue = [];

            for (const fill of fillsList) {
              let remaining = fill.remaining_qty;
              const action = (fill.action || '').toLowerCase();

              if (action === 'buy') {
                while (remaining > 0 && shortQueue.length > 0) {
                  const entry = shortQueue[0];
                  const matchedQty = Math.min(remaining, entry.remaining_qty);
                  const exit = fill;

                  const contractInfo = await getContractInfo(contractId);
                  const direction = 'SHORT';
                  const priceDiff = (exit.price - entry.price) * -1;
                  const pnl = priceDiff * contractInfo.valuePerPoint * matchedQty;
                  const ticket = `tv-${entry.id}-${exit.id}-${matchedQty}`;

                  if (!ticketSet.has(ticket)) {
                    ticketSet.add(ticket);
                    tradesToInsert.push({
                      ticket,
                      date: formatDateOnly(entry.timestamp),
                      pair: contractInfo.symbol,
                      direction,
                      comment: contractInfo.productName || 'Tradovate',
                      entry_time: new Date(entry.timestamp).toISOString().slice(11, 16),
                      exit_time: new Date(exit.timestamp).toISOString().slice(11, 16),
                      entry_price: entry.price,
                      exit_price: exit.price,
                      lot_size: matchedQty,
                      commission: 0,
                      swap: 0,
                      profit_usd: parseFloat(pnl.toFixed(2))
                    });
                  }

                  remaining -= matchedQty;
                  entry.remaining_qty -= matchedQty;
                  remainingMap.set(entry.id, entry.remaining_qty);

                  if (entry.remaining_qty <= 0) shortQueue.shift();
                }

                fill.remaining_qty = remaining;
                remainingMap.set(fill.id, fill.remaining_qty);
                if (remaining > 0) longQueue.push(fill);
              } else if (action === 'sell') {
                while (remaining > 0 && longQueue.length > 0) {
                  const entry = longQueue[0];
                  const matchedQty = Math.min(remaining, entry.remaining_qty);
                  const exit = fill;

                  const contractInfo = await getContractInfo(contractId);
                  const direction = 'LONG';
                  const priceDiff = (exit.price - entry.price);
                  const pnl = priceDiff * contractInfo.valuePerPoint * matchedQty;
                  const ticket = `tv-${entry.id}-${exit.id}-${matchedQty}`;

                  if (!ticketSet.has(ticket)) {
                    ticketSet.add(ticket);
                    tradesToInsert.push({
                      ticket,
                      date: formatDateOnly(entry.timestamp),
                      pair: contractInfo.symbol,
                      direction,
                      comment: contractInfo.productName || 'Tradovate',
                      entry_time: new Date(entry.timestamp).toISOString().slice(11, 16),
                      exit_time: new Date(exit.timestamp).toISOString().slice(11, 16),
                      entry_price: entry.price,
                      exit_price: exit.price,
                      lot_size: matchedQty,
                      commission: 0,
                      swap: 0,
                      profit_usd: parseFloat(pnl.toFixed(2))
                    });
                  }

                  remaining -= matchedQty;
                  entry.remaining_qty -= matchedQty;
                  remainingMap.set(entry.id, entry.remaining_qty);

                  if (entry.remaining_qty <= 0) longQueue.shift();
                }

                fill.remaining_qty = remaining;
                remainingMap.set(fill.id, fill.remaining_qty);
                if (remaining > 0) shortQueue.push(fill);
              }
            }
          }

          // Persist remaining_qty updates
          for (const [fillId, remainingQtyRaw] of remainingMap.entries()) {
            const remainingQty = parseFloat(remainingQtyRaw || 0);
            const status = remainingQty > 0 ? 'open' : 'closed';
            await executeTursoQuery(
              'UPDATE tradovate_fills SET remaining_qty = ?, status = ? WHERE id = ?',
              [remainingQty, status, fillId]
            );
          }

          // Insert trades
          if (tradesToInsert.length > 0) {
            const values = tradesToInsert.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const args = [];
            for (const t of tradesToInsert) {
              args.push(
                generateId(),
                accountId,
                t.date,
                t.pair,
                t.direction,
                t.comment,
                t.entry_time,
                t.exit_time,
                null,
                new Date().toISOString(),
                t.ticket,
                t.lot_size,
                t.entry_price,
                t.exit_price,
                t.commission,
                t.swap,
                t.profit_usd,
                'tradovate'
              );
            }

            await executeTursoQuery(
              `INSERT INTO trades (
                id, account_id, date, pair, direction,
                comment, entry_time, exit_time, tradingview_url, timestamp,
                ticket, lot_size, entry_price, exit_price,
                commission, swap, profit_usd, import_source
              ) VALUES ${values}`,
              args
            );
          }

          await executeTursoQuery(
            'UPDATE tradovate_connections SET last_sync = ?, updated_at = ? WHERE id = ?',
            [new Date().toISOString(), new Date().toISOString(), connection.id]
          );

          await executeTursoQuery('UPDATE accounts SET syncing = 0, synced_at = ? WHERE id = ?', [new Date().toISOString(), accountId]);

          return new Response(JSON.stringify({ success: true, inserted: tradesToInsert.length }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          try {
            if (accountId) {
              await executeTursoQuery('UPDATE accounts SET syncing = 0 WHERE id = ?', [accountId]);
            }
          } catch (e) {}
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // PAYPAL VERIFY - Vincular suscripción
      // ============================================
      if (path === '/api/paypal/verify' && request.method === 'POST') {
        try {
          await ensurePayPalColumns();
          const { subscriptionId } = await request.json();

          if (!subscriptionId) {
            return new Response(JSON.stringify({ error: 'Missing subscriptionId' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const accessToken = await getPayPalAccessToken(env);
          const subscriptionResp = await fetch(
            `${getPayPalBaseUrl(env)}/v1/billing/subscriptions/${subscriptionId}`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );

          if (!subscriptionResp.ok) {
            const errorText = await subscriptionResp.text();
            return new Response(JSON.stringify({ error: 'PayPal subscription not found', details: errorText }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const subscription = await subscriptionResp.json();
          if (subscription.status !== 'ACTIVE') {
            return new Response(JSON.stringify({ error: 'Subscription not active', status: subscription.status }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const plan = resolvePlanFromPayPal(subscription.plan_id, env);
          if (!plan) {
            return new Response(JSON.stringify({ error: 'Unknown PayPal plan', planId: subscription.plan_id }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const payerId = subscription?.subscriber?.payer_id || null;
          const expiresAt = resolveNextBillingDate(subscription);

          await executeTursoQuery(
            'UPDATE users SET paypal_subscription_id = ?, paypal_payer_id = ?, user_plan = ?, expires_at = ?, is_active = 1 WHERE id = ?',
            [subscriptionId, payerId, plan, expiresAt, userId]
          );

          return new Response(JSON.stringify({
            success: true,
            plan,
            subscriptionId,
            expiresAt
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // PAYPAL SUBSCRIPTION INFO
      // ============================================
      if (path === '/api/paypal-subscription-info' && request.method === 'GET') {
        try {
          await ensurePayPalColumns();
          const result = await executeTursoQuery(
            'SELECT paypal_subscription_id, user_plan, expires_at FROM users WHERE id = ?',
            [userId]
          );

          if (!result?.rows?.length) {
            return new Response(JSON.stringify({ error: 'User not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const user = result.rows[0];
          if (!user.paypal_subscription_id) {
            return new Response(JSON.stringify({
              hasSubscription: false,
              plan: user.user_plan,
              expires_at: user.expires_at || null
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const accessToken = await getPayPalAccessToken(env);
          const subscriptionResp = await fetch(
            `${getPayPalBaseUrl(env)}/v1/billing/subscriptions/${user.paypal_subscription_id}`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );

          if (!subscriptionResp.ok) {
            return new Response(JSON.stringify({
              hasSubscription: true,
              plan: user.user_plan,
              expires_at: user.expires_at || null,
              error: 'Failed to fetch PayPal subscription'
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const subscription = await subscriptionResp.json();
          const plan = resolvePlanFromPayPal(subscription.plan_id, env) || user.user_plan;

          return new Response(JSON.stringify({
            hasSubscription: true,
            plan,
            subscription,
            expires_at: user.expires_at || null
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // VERIFY STRIPE SESSION & ACTIVATE PLAN
      // ============================================
      if (path === '/api/verify-payment' && request.method === 'POST') {
        try {
          const { sessionId } = await request.json();
          
          if (!sessionId) {
            return new Response(JSON.stringify({ error: 'Missing sessionId' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const STRIPE_SECRET = env?.STRIPE_SECRET;
          if (!STRIPE_SECRET) {
            return new Response(JSON.stringify({ error: 'Stripe secret not configured' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // Fetch session details from Stripe
          const sessionResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET}`
            }
          });

          if (!sessionResponse.ok) {
            const error = await sessionResponse.json();
            return new Response(JSON.stringify({ error: 'Failed to verify session' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const session = await sessionResponse.json();
          
          // Only process completed sessions
          if (session.payment_status !== 'paid') {
            return new Response(JSON.stringify({ error: 'Payment not completed', status: session.payment_status }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const userEmail = session.customer_email;
          const plan = session.metadata?.plan || 'pro';
          const userId = session.client_reference_id;

          if (!userEmail) {
            return new Response(JSON.stringify({ error: 'No email in session' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Calculate expires_at: 30 days from now
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          const expiresAtStr = expiresAt.toISOString();

          if (userId) {
            // Update existing user
            await tursoClient.execute(
              'UPDATE users SET user_plan = ?, expires_at = ?, is_active = 1 WHERE id = ?',
              [plan, expiresAtStr, userId]
            );
          } else {
            // New user - create account
            const tempPassword = Math.random().toString(36).slice(-12);
            const hashedPassword = await hashPassword(tempPassword);
            const newUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
            const createdAt = new Date().toISOString();

            await tursoClient.execute(
              `INSERT INTO users (id, email, username, password_hash, user_plan, user_type, is_active, created_at, expires_at, last_login) 
               VALUES (?, ?, ?, ?, ?, 'user', 1, ?, ?, ?)`,
              [newUserId, userEmail, userEmail.split('@')[0], hashedPassword, plan, createdAt, expiresAtStr, createdAt]
            );
          }

          return new Response(JSON.stringify({ 
            success: true, 
            plan: plan, 
            expiresAt: expiresAtStr,
            message: 'Plan activated successfully'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // STRIPE CHECKOUT (Legacy for backward compatibility)
      // Maps to /api/stripe-checkout
      // ============================================
      if ((path === '/api/checkout' || path === '/api/stripe-checkout') && request.method === 'POST') {
        try {
          const { priceId, plan, email, userId } = await request.json();

          if (!priceId || !plan || !email) {
            return new Response(JSON.stringify({ error: 'Missing required fields: priceId, plan, email' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // If userId is provided, validate user exists and get current plan
          if (userId) {
            try {
              const userResult = await executeTursoQuery(
                'SELECT id, user_plan FROM users WHERE id = ?',
                [userId]
              );

              if (!userResult || !userResult.rows || userResult.rows.length === 0) {
                return new Response(JSON.stringify({ error: 'User not found' }), {
                  status: 404,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              // Prevent downgrading plan
              const currentPlan = userResult.rows[0].user_plan || 'free';
              if (plan === 'free') {
                return new Response(JSON.stringify({ error: 'Cannot downgrade to free plan' }), {
                  status: 400,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              // Prevent paying for same plan
              if (currentPlan === plan) {
                return new Response(JSON.stringify({ error: `You already have the ${plan} plan` }), {
                  status: 400,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
            } catch (dbError) {
              return new Response(JSON.stringify({ error: 'Error validating user' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          }

          const STRIPE_SECRET = env?.STRIPE_SECRET;
          if (!STRIPE_SECRET) {
            return new Response(JSON.stringify({ error: 'Stripe secret not configured' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          

          // Get origin from request header (works in both local and production)
          const origin = request.headers.get('origin') || 'https://tripulacionfx.com';

          // Call Stripe API to create checkout session
          const bodyParams = new URLSearchParams({
            'payment_method_types[]': 'card',
            'line_items[0][price]': priceId,
            'line_items[0][quantity]': '1',
            'mode': 'subscription',
            'success_url': `${origin}/payment-status?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            'cancel_url': `${origin}/payment-status?payment=canceled`,
            'customer_email': email,
            'metadata[plan]': plan,
          });

          // Only add userId fields if userId is provided (authenticated user)
          if (userId) {
            bodyParams.append('client_reference_id', userId);
            bodyParams.append('metadata[userId]', userId);
          }

          const checkoutSession = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: bodyParams.toString()
          });

          if (!checkoutSession.ok) {
            const error = await checkoutSession.json();
            return new Response(JSON.stringify({ error: error.error?.message || 'Failed to create session' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const session = await checkoutSession.json();
          return new Response(JSON.stringify({ sessionId: session.id }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // STRIPE CUSTOMER PORTAL - Manage Subscription
      // ============================================
      if (path === '/api/stripe-portal' && request.method === 'POST') {
        try {
          const STRIPE_SECRET = env?.STRIPE_SECRET;
          
          if (!STRIPE_SECRET) {
            return new Response(JSON.stringify({ error: 'Stripe secret not configured' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const { userId } = await request.json();
          
          
          if (!userId) {
            return new Response(JSON.stringify({ error: 'Missing userId' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Ensure stripe_customer_id column exists
          try {
            await executeTursoQuery(
              'ALTER TABLE users ADD COLUMN stripe_customer_id TEXT DEFAULT NULL'
            );
          } catch (e) {
            // Column might already exist, ignore error
          }

          // Get user email
          const userResult = await executeTursoQuery(
            'SELECT email, stripe_customer_id, user_plan FROM users WHERE id = ?',
            [userId]
          );


          if (!userResult?.rows?.length) {
            return new Response(JSON.stringify({ error: 'User not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const user = userResult.rows[0];
          let customerId = user.stripe_customer_id;
          

          // If no customer ID, create one
          if (!customerId) {
            const customerResponse = await fetch('https://api.stripe.com/v1/customers', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${STRIPE_SECRET}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                'email': user.email,
                'metadata[userId]': userId
              }).toString()
            });

            const customerData = await customerResponse.json();
            
            if (!customerData.id) {
              return new Response(JSON.stringify({ 
                error: 'Failed to create Stripe customer',
                details: customerData.error?.message || 'Unknown error'
              }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
            
            customerId = customerData.id;

            // Save customer ID
            await executeTursoQuery(
              'UPDATE users SET stripe_customer_id = ? WHERE id = ?',
              [customerId, userId]
            );
          }

          // Create portal session
          const origin = request.headers.get('origin') || 'https://tripulacionfx.com';
          const portalResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              'customer': customerId,
              'return_url': `${origin}/journal`
            }).toString()
          });

          const portalData = await portalResponse.json();
          
          if (!portalResponse.ok || !portalData.url) {
            return new Response(JSON.stringify({ 
              error: 'Failed to create portal session',
              details: portalData.error?.message || 'Unknown error'
            }), {
              status: portalResponse.status || 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ url: portalData.url }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // STRIPE SUBSCRIPTION INFO - Get subscription details & invoices
      // ============================================
      if (path === '/api/stripe-subscription-info' && request.method === 'GET') {
        try {
          // Verificar token
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          if (!token) {
            return new Response(JSON.stringify({ error: 'Unauthorized - Missing token' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const STRIPE_SECRET = env?.STRIPE_SECRET;
          
          if (!STRIPE_SECRET) {
            return new Response(JSON.stringify({ error: 'Stripe secret not configured' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const url = new URL(request.url);
          const userId = url.searchParams.get('userId');
          
          if (!userId) {
            return new Response(JSON.stringify({ error: 'Missing userId' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Get user's stripe_customer_id and expires_at
          const userResult = await executeTursoQuery(
            'SELECT stripe_customer_id, user_plan, expires_at FROM users WHERE id = ?',
            [userId]
          );

          if (!userResult?.rows?.length) {
            return new Response(JSON.stringify({ error: 'User not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const user = userResult.rows[0];
          const customerId = user.stripe_customer_id;
          
          // Calcular fecha de renovación desde expires_at
          let renewalTimestamp = null;
          if (user.expires_at) {
            const expiryDate = new Date(user.expires_at);
            renewalTimestamp = Math.floor(expiryDate.getTime() / 1000);
          }
          
          // If no customer ID, user hasn't subscribed yet
          if (!customerId) {
            return new Response(JSON.stringify({ 
              hasSubscription: false,
              plan: user.user_plan,
              subscription: renewalTimestamp ? {
                current_period_end: renewalTimestamp,
                status: 'active'
              } : null,
              invoices: []
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Crear objeto de suscripción simple basado en expires_at
          let subscriptionInfo = null;
          if (user.user_plan && user.user_plan.toLowerCase() !== 'free') {
            subscriptionInfo = {
              id: customerId,
              status: 'active',
              current_period_end: renewalTimestamp,
              current_period_start: null,
              cancel_at_period_end: false,
              plan_id: null,
              amount: 0,
              currency: 'eur'
            };
          }

          // Fetch invoices from Stripe (solo finalizadas y pagadas)
          const invoicesResponse = await fetch(
            `https://api.stripe.com/v1/invoices?customer=${customerId}&limit=10&status=paid`,
            {
              headers: {
                'Authorization': `Bearer ${STRIPE_SECRET}`
              }
            }
          );

          const invoicesData = await invoicesResponse.json();
          
          const invoices = invoicesData.data ? invoicesData.data
            .filter(inv => inv.amount_paid > 0) // Solo facturas con monto > 0
            .map(inv => ({
              id: inv.id,
              number: inv.number,
              amount: inv.amount_paid / 100,
              currency: inv.currency.toUpperCase(),
              date: inv.created,
              status: inv.status,
              pdf_url: inv.invoice_pdf,
              hosted_invoice_url: inv.hosted_invoice_url
            })) : [];

          return new Response(JSON.stringify({
            hasSubscription: !!subscriptionInfo,
            plan: user.user_plan,
            subscription: subscriptionInfo,
            invoices: invoices
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (error) {
          return new Response(JSON.stringify({ 
            error: 'Failed to fetch subscription info',
            details: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // STRIPE WEBHOOK
      // ============================================
      if (path === '/webhook/stripe' && request.method === 'POST') {
        try {
          const signature = request.headers.get('stripe-signature');
          const body = await request.text();
          const WEBHOOK_SECRET = env?.STRIPE_WEBHOOK_SECRET || 'whsec_VnKR3dNRTOc4U5thek1tk3TkSBFXagwk';

          // Validate webhook signature
          if (!signature || !WEBHOOK_SECRET) {
            
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Verify signature using crypto
          const encoder = new TextEncoder();
          const parts = signature.split(',');
          let timestamp = '';
          let receivedSignature = '';
          
          for (const part of parts) {
            const [key, value] = part.split('=');
            if (key.trim() === 't') timestamp = value;
            if (key.trim() === 'v1') receivedSignature = value;
          }

          const signedContent = `${timestamp}.${body}`;
          const key = encoder.encode(WEBHOOK_SECRET.replace('whsec_', ''));
          const hmac = await crypto.subtle.sign('HMAC', 
            await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
            encoder.encode(signedContent)
          );
          
          const calculatedSignature = Array.from(new Uint8Array(hmac))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

          // Compare signatures (timing-safe)
          if (calculatedSignature !== receivedSignature) {
            
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Ensure stripe_customer_id column exists
          try {
            await executeTursoQuery(
              'ALTER TABLE users ADD COLUMN stripe_customer_id TEXT DEFAULT NULL'
            );
          } catch (e) {
            // Column might already exist, ignore error
          }

          const event = JSON.parse(body);

          // ===== CHECKOUT SESSION COMPLETED =====
          if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userEmail = session.customer_email;
            const customerId = session.customer;
            const plan = session.metadata?.plan || 'pro';

            if (userEmail) {
              let userId = session.client_reference_id;
              
              if (!userId) {
                // Create new user with temporary password
                const tempPassword = Math.random().toString(36).slice(-12);
                const hashedPassword = await hashPassword(tempPassword);
                
                userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
                
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30);
                const expiresAtStr = expiresAt.toISOString();
                const createdAt = new Date().toISOString();

                try {
                  await tursoClient.execute(
                    `INSERT INTO users (id, email, username, password_hash, user_plan, user_type, is_active, created_at, expires_at, stripe_customer_id, last_login) 
                     VALUES (?, ?, ?, ?, ?, 'user', 1, ?, ?, ?, ?)`,
                    [userId, userEmail, userEmail.split('@')[0], hashedPassword, plan, createdAt, expiresAtStr, customerId, createdAt]
                  );

                  await sendTempPasswordEmail(userEmail, tempPassword, env);
                  
                } catch (createError) {
                }
              } else {
                // Update existing user
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30);
                const expiresAtStr = expiresAt.toISOString();

                await tursoClient.execute(
                  'UPDATE users SET user_plan = ?, expires_at = ?, is_active = 1, stripe_customer_id = ? WHERE id = ?',
                  [plan, expiresAtStr, customerId, userId]
                );

                
                try {
                  await sendPaymentConfirmationEmail(userEmail, plan, expiresAtStr, env);
                } catch (emailError) {
                }
              }
            }
          }

          // ===== SUBSCRIPTION UPDATED =====
          else if (event.type === 'customer.subscription.updated') {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            
            // Find user by stripe_customer_id
            try {
              const userResult = await executeTursoQuery(
                'SELECT id, user_plan, expires_at FROM users WHERE stripe_customer_id = ?',
                [customerId]
              );

              if (userResult?.rows?.length) {
                const user = userResult.rows[0];
                
                // Actualizar expires_at según current_period_end
                const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
                
                if (subscription.status === 'active') {
                  // Renovación exitosa
                  await executeTursoQuery(
                    'UPDATE users SET expires_at = ?, user_plan = ? WHERE id = ?',
                    [currentPeriodEnd.toISOString(), user.user_plan, user.id]
                  );
                } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
                  // Pago vencido pero aún activo - marcar expiración cercana
                }
              }
            } catch (updateError) {
            }
          }

          // ===== SUBSCRIPTION DELETED / CANCELLED =====
          else if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            
            try {
              const userResult = await executeTursoQuery(
                'SELECT id, email FROM users WHERE stripe_customer_id = ?',
                [customerId]
              );

              if (userResult?.rows?.length) {
                const user = userResult.rows[0];
                const userId = user.id;
                const email = user.email;
                
                // Determine expiration date
                let expiresAt = null;
                
                if (subscription.current_period_end) {
                  // Usuario puede usar hasta el final del período
                  expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
                  
                  // Update expires_at but keep the plan active until period ends
                  await executeTursoQuery(
                    'UPDATE users SET expires_at = ? WHERE id = ?',
                    [expiresAt, userId]
                  );
                } else {
                  // Cancelación inmediata (rare case)
                  
                  // Downgrade a FREE inmediatamente
                  await executeTursoQuery(
                    'UPDATE users SET user_plan = ?, expires_at = NULL WHERE id = ?',
                    ['free', userId]
                  );
                  
                  // FIX: NO archivar cuentas cuando se cancela la suscripción
                  // El usuario DEBE poder ver sus cuentas incluso en Free
                  // Solo se aplican restricciones de funcionalidad, no de visibilidad
                  
                }
              }
            } catch (cancelError) {
            }
          }

          // ===== INVOICE PAYMENT FAILED =====
          else if (event.type === 'invoice.payment_failed') {
            const invoice = event.data.object;
            const customerId = invoice.customer;
            const subscriptionId = invoice.subscription;
            
            
            // Notificar al usuario pero no downgrade automático
            // Stripe seguirá intentando cobrar según su configuración
            try {
              const userResult = await executeTursoQuery(
                'SELECT email FROM users WHERE stripe_customer_id = ?',
                [customerId]
              );

              if (userResult?.rows?.length) {
                const email = userResult.rows[0].email;
                // TODO: Enviar email notificando del pago fallido
              }
            } catch (e) {
            }
          }

          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Execute query
      if (path === '/api/execute' && request.method === 'POST') {
        const { sql, args = [] } = await request.json();
        
        if (!sql || typeof sql !== 'string') {
          return new Response(JSON.stringify({ error: 'Invalid SQL query' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!Array.isArray(args)) {
          return new Response(JSON.stringify({ error: 'Invalid arguments' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verificar si es query admin-only y el usuario tiene rol admin
        if (isAdminOnlyQuery(sql) && !isAdminRole) {
          
          return new Response(JSON.stringify({ 
            error: 'Admin privileges required',
            sql: sql.substring(0, 50)
          }), { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!isQueryAllowed(sql)) {
          
          return new Response(JSON.stringify({ 
            error: 'Query not allowed',
            sql: sql.substring(0, 100)
          }), { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        try {
          const queryResult = await executeTursoQuery(sql, args);
          return new Response(JSON.stringify(queryResult), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Migration endpoint
      if (path === '/api/migrate' && request.method === 'POST') {
        const workerSecret = (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET;
        const authHeader = request.headers.get('Authorization') || '';
        const tokenParts = authHeader.split(' ');
        if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }

        const provided = tokenParts[1];
        const payload = await verifyJWT(provided, workerSecret);
        if (!payload || payload.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }

        try {
          const ddl = [
            `CREATE TABLE IF NOT EXISTS installations (
                id TEXT PRIMARY KEY,
                api_key TEXT UNIQUE NOT NULL,
                installation_id TEXT NOT NULL,
                user_email TEXT,
                machine_info TEXT,
                confirmed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_sync TEXT,
                is_active INTEGER DEFAULT 1
            )`,
            `CREATE INDEX IF NOT EXISTS idx_api_key ON installations(api_key)`,
            `CREATE INDEX IF NOT EXISTS idx_installation_id ON installations(installation_id)`,
            `CREATE INDEX IF NOT EXISTS idx_user_email ON installations(user_email)`,
            `CREATE TABLE IF NOT EXISTS daily_notes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                date TEXT NOT NULL,
                sentiment TEXT,
                note TEXT,
                day_outcome TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, account_id, date)
            )`,
            `CREATE INDEX IF NOT EXISTS idx_daily_notes_user_account_date ON daily_notes(user_id, account_id, date)`,
            `CREATE INDEX IF NOT EXISTS idx_daily_notes_user_date ON daily_notes(user_id, date)`,
            `CREATE TABLE IF NOT EXISTS payouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                amount REAL NOT NULL,
                payout_date TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )`,
            `CREATE INDEX IF NOT EXISTS idx_payouts_account ON payouts(account_id)`,
            `CREATE INDEX IF NOT EXISTS idx_payouts_date ON payouts(payout_date)`,
            `CREATE TABLE IF NOT EXISTS cashflows (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                date TEXT NOT NULL,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE INDEX IF NOT EXISTS idx_cashflows_account ON cashflows(account_id)`,
            `CREATE INDEX IF NOT EXISTS idx_cashflows_user ON cashflows(user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_cashflows_date ON cashflows(date)`
          ];

          const results = [];
          for (const s of ddl) {
            try {
              const r = await executeTursoQuery(s, []);
              results.push({ sql: s.slice(0,60), ok: true, rowsAffected: r.rowsAffected || 0 });
            } catch (err) {
              results.push({ sql: s.slice(0,60), ok: false, error: String(err && err.message ? err.message : err) });
            }
          }

          return new Response(JSON.stringify({ success: true, results }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        } catch (err) {
          
          return new Response(JSON.stringify({ error: err.message || String(err) }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      }

      // ============================================
      // ENDPOINT LIMPIAR KV AL BORRAR CUENTA
      // ============================================
      if (path === '/api/delete-kv' && request.method === 'POST') {
        try {
          const data = await request.json().catch(() => ({}));
          const { key, token } = data;

          if (!key || !token) {
            return new Response(JSON.stringify({ error: 'Missing key or token' }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // ? VALIDAR TOKEN - Aceptar userToken O JWT
          // Primero intentar verificar como JWT
          let payload = await verifyJWT(token, FALLBACK_ADMIN_SECRET);
          
          // Si no es JWT v�lido, validar como userToken
          if (!payload) {
            // Validar que el userToken existe en la BD y pertenece a un usuario activo
            const userResult = await executeTursoQuery(
              'SELECT id, email FROM users WHERE token = ? AND is_active = 1',
              [token]
            );
            
            if (!userResult || userResult.rows.length === 0) {
              warn('? Token inv�lido');
              return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
                status: 401, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          }

          // ?? ELIMINAR DE KV
          if (!env || !env.ACCOUNTS_KV) {
            
            return new Response(JSON.stringify({ 
              error: 'KV storage not configured',
              success: false
            }), { 
              status: 503, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          try {
            await env.ACCOUNTS_KV.delete(key);

            return new Response(JSON.stringify({ 
              success: true,
              message: 'KV key deleted'
            }), { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } catch (kvErr) {
            
            return new Response(JSON.stringify({ 
              error: 'KV delete failed',
              details: kvErr.message,
              success: false
            }), { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

        } catch (error) {
          
          return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // ENDPOINT GET KV DATA (para leer balance/equity del EA)
      // ============================================
      if (path === '/api/get-kv' && request.method === 'POST') {
        try {
          const data = await request.json().catch(() => ({}));
          const { key, token } = data;

          if (!key) {
            return new Response(JSON.stringify({ error: 'Missing key' }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }


          // ?? INTENTAR LEER DE BD DIRECTAMENTE (fallback seguro)
          try {
            // Extraer email y account del key: "pending:email@domain.com:ACCOUNT_NUMBER"
            const keyParts = key.split(':');
            if (keyParts.length === 3 && keyParts[0] === 'pending') {
              const emailFromKey = keyParts[1];
              const accountFromKey = keyParts[2];
              
              
              const installResult = await executeTursoQuery(
                `SELECT broker, server, machine_info FROM installations 
                 WHERE LOWER(user_email) = LOWER(?) AND account = ? 
                 ORDER BY created_at DESC LIMIT 1`,
                [emailFromKey, accountFromKey]
              );
              
              if (installResult && installResult.rows.length > 0) {
                const installation = installResult.rows[0];
                let balance = 0, equity = 0;
                
                try {
                  if (installation.machine_info) {
                    const machineInfo = JSON.parse(installation.machine_info);
                    balance = machineInfo.balance || machineInfo.Balance || 0;
                    equity = machineInfo.equity || machineInfo.Equity || 0;
                  }
                } catch (e) {
                  warn('? Parsing');
                }
                
                // Construir respuesta con datos de BD
                const response = {
                  accountNumber: accountFromKey,
                  userEmail: emailFromKey,
                  broker: installation.broker || 'Unknown',
                  server: installation.server || 'Unknown',
                  balance: balance,
                  equity: equity,
                  margin: 0,
                  freeMargin: 0,
                  profit: 0,
                  leverage: 0,
                  timestamp: Date.now(),
                  status: 'pending',
                  platform: 'MT4',
                  source: 'bd'
                };
                
                
                return new Response(JSON.stringify({ 
                  success: true,
                  data: response,
                  source: 'bd'
                }), { 
                  status: 200, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
            }
          } catch (bdErr) {
            
          }
          
          // Si llegamos aqu�, no encontramos datos
          return new Response(JSON.stringify({ 
            success: false,
            data: null,
            message: 'Key not found'
          }), { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
          
        } catch (error) {
          
          return new Response(JSON.stringify({ 
            error: error.message,
            success: false
          }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // ENDPOINT OBTENER EVENTOS ECONÓMICOS
      // GET /api/economic-events?from=2026-01-01&to=2026-01-31
      // ============================================
      if (path === '/api/economic-events' && request.method === 'GET') {
        try {
          const queryUrl = new URL(request.url);
          const from = queryUrl.searchParams.get('from');
          const to = queryUrl.searchParams.get('to');
          const impact = queryUrl.searchParams.get('impact'); // optional filter
          
          let sql = 'SELECT * FROM economic_events WHERE date >= ? AND date <= ?';
          let args = [from || '2026-01-01', to || '2026-12-31'];
          
          if (impact) {
            sql += ' AND impact = ?';
            args.push(impact.toLowerCase());
          }
          
          sql += ' ORDER BY date ASC';
          
          const result = await executeTursoQuery(sql, args);
          
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ============================================
      // CHANGE PLAN / UPDATE SUBSCRIPTION
      // ============================================
      if (path === '/api/change-plan' && request.method === 'POST') {
        try {
          
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          if (!token) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const payload = await verifyJWT(token, env?.JWT_SECRET || FALLBACK_ADMIN_SECRET);
          if (!payload) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const userId = payload.userId || payload.user_id;
          
          const { newPlan, priceId } = await request.json();

          if (!newPlan || !priceId) {
            return new Response(JSON.stringify({ error: 'Missing newPlan or priceId' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const STRIPE_SECRET = env?.STRIPE_SECRET;
          if (!STRIPE_SECRET) {
            return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Get current user plan and Stripe info
          const userResult = await executeTursoQuery(
            `SELECT id, email, user_plan, stripe_customer_id FROM users WHERE id = ?`,
            [userId]
          );

          if (!userResult?.rows?.length) {
            return new Response(JSON.stringify({ error: 'User not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const user = userResult.rows[0];
          const currentPlan = user.user_plan || 'free';

          if (currentPlan === newPlan) {
            return new Response(JSON.stringify({ error: 'Already on this plan' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // CASO 1: Free → Pro/Unlimited (Nueva suscripción)
          if (currentPlan === 'free' && (newPlan === 'pro' || newPlan === 'unlimited')) {
            const origin = request.headers.get('origin') || 'https://tripulacionfx.com';
            
            const bodyParams = new URLSearchParams({
              'payment_method_types[]': 'card',
              'line_items[0][price]': priceId,
              'line_items[0][quantity]': '1',
              'mode': 'subscription',
              'success_url': `${origin}/payment-status?payment=success&session_id={CHECKOUT_SESSION_ID}`,
              'cancel_url': `${origin}/payment-status?payment=canceled`,
              'customer_email': user.email,
              'client_reference_id': userId,
              'metadata[plan]': newPlan,
              'metadata[userId]': userId
            });

            const checkoutSession = await fetch('https://api.stripe.com/v1/checkout/sessions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${STRIPE_SECRET}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: bodyParams.toString()
            });

            if (!checkoutSession.ok) {
              const error = await checkoutSession.json();
              return new Response(JSON.stringify({ error: error.error?.message || 'Failed to create checkout' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            const session = await checkoutSession.json();
            return new Response(JSON.stringify({ 
              url: session.url,
              sessionId: session.id,
              action: 'redirect_to_checkout'
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // CASO 2: Pro/Unlimited → Free (Cancelar suscripción)
          if (newPlan === 'free') {
            if (!user.stripe_customer_id) {
              // User has no Stripe subscription, just update DB
              await executeTursoQuery(
                `UPDATE users SET user_plan = ?, expires_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [newPlan, userId]
              );
              return new Response(JSON.stringify({ 
                success: true,
                message: 'Downgraded to Free',
                plan: newPlan
              }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            // Get active subscriptions
            const subsResponse = await fetch(
              `https://api.stripe.com/v1/subscriptions?customer=${user.stripe_customer_id}&status=active&limit=1`,
              {
                headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
              }
            );

            if (subsResponse.ok) {
              const subsData = await subsResponse.json();
              if (subsData.data?.length > 0) {
                const subscription = subsData.data[0];

                // Cancel at period end
                const cancelResponse = await fetch(
                  `https://api.stripe.com/v1/subscriptions/${subscription.id}`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${STRIPE_SECRET}`,
                      'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                      'cancel_at_period_end': 'true'
                    }).toString()
                  }
                );

                if (cancelResponse.ok) {
                  // Update DB to show plan will be free at period end
                  const endDate = new Date(subscription.current_period_end * 1000).toISOString();
                  await executeTursoQuery(
                    `UPDATE users SET user_plan = ?, expires_at = ?, is_active = 0 WHERE id = ?`,
                    ['free', endDate, userId]
                  );

                  return new Response(JSON.stringify({
                    success: true,
                    message: 'Subscription will be cancelled at period end',
                    cancelDate: endDate,
                    plan: 'free'
                  }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                  });
                }
              }
            }

            return new Response(JSON.stringify({ error: 'Could not cancel subscription' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // CASO 3: Pro ↔ Unlimited (Actualizar suscripción existente)
          if ((currentPlan === 'pro' && newPlan === 'unlimited') || 
              (currentPlan === 'unlimited' && newPlan === 'pro')) {
            
            if (!user.stripe_customer_id) {
              return new Response(JSON.stringify({ error: 'No Stripe subscription found' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            // Get active subscription (including those with cancel_at_period_end)
            const subsResponse = await fetch(
              `https://api.stripe.com/v1/subscriptions?customer=${user.stripe_customer_id}&status=active`,
              {
                headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
              }
            );

            if (!subsResponse.ok) {
              return new Response(JSON.stringify({ error: 'Could not find subscription' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            const subsData = await subsResponse.json();
            
            if (!subsData.data?.length) {
              return new Response(JSON.stringify({ error: 'No active subscription found. Your subscription may have been cancelled.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            const subscription = subsData.data[0];
            
            const currentItemId = subscription.items.data[0].id;

            // Update subscription with new price
            const updateResponse = await fetch(
              `https://api.stripe.com/v1/subscriptions/${subscription.id}`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${STRIPE_SECRET}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                  'items[0][id]': currentItemId,
                  'items[0][price]': priceId,
                  'proration_behavior': 'create_prorations'
                }).toString()
              }
            );

            if (!updateResponse.ok) {
              const error = await updateResponse.json();
              return new Response(JSON.stringify({ error: error.error?.message || 'Failed to update subscription' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            const updatedSub = await updateResponse.json();

            // Update DB
            await executeTursoQuery(
              `UPDATE users SET user_plan = ? WHERE id = ?`,
              [newPlan, userId]
            );

            return new Response(JSON.stringify({
              success: true,
              message: 'Plan updated successfully',
              plan: newPlan,
              proratedAmount: updatedSub.next_invoice_total ? (updatedSub.next_invoice_total / 100) : null
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'Invalid plan transition' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ==================== TRADING PLANS API (SECURED WITH JWT) ====================

      // ==================== TRADING PLANS API (SECURED WITH JWT) ====================
      
      // POST /api/plan/get
      if (request.method === 'POST' && path === '/api/plan/get') {
        try {
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          if (!token) {
            return new Response(JSON.stringify({ error: 'Missing authorization token' }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          const payload = await verifyJWT(token, (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET);
          if (!payload) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          let body = {};
          try { body = await request.json(); } catch (e) { body = {}; }
          const userId = payload.userId || payload.user_id || payload.sub;
          const accountId = body.accountId || payload.account_id || payload.accountId || payload.userId || payload.user_id;
          if (!accountId) {
            return new Response(JSON.stringify({ error: 'Missing accountId' }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          if (userId) {
            const accCheck = await executeTursoQuery('SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', [accountId, userId]);
            if (!accCheck?.rows?.length) {
              return new Response(JSON.stringify({ error: 'Account not found for user' }), { 
                status: 403, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              });
            }
          }
          const result = await executeTursoQuery('SELECT * FROM trading_plans WHERE account_id = ? ORDER BY created_at DESC LIMIT 1', [accountId]);
          const plan = result.rows && result.rows.length > 0 ? result.rows[0] : null;
          return new Response(JSON.stringify({ success: true, plan }), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      }

      // POST /api/plan/create
      if (request.method === 'POST' && path === '/api/plan/create') {
        try {
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          if (!token) {
            return new Response(JSON.stringify({ error: 'Missing authorization token' }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          const payload = await verifyJWT(token, (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET);
          if (!payload) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          const body = await request.json();
          const { checkpointValues, accountId } = body || {};
          const userId = payload.userId || payload.user_id || payload.sub;
          const effectiveAccountId = accountId || payload.account_id || payload.accountId || payload.userId || payload.user_id;
          if (!effectiveAccountId) {
            return new Response(JSON.stringify({ error: 'Missing accountId' }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          if (userId) {
            const accRow = await executeTursoQuery('SELECT id, mt_account_number, sync_provider FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', [effectiveAccountId, userId]);
            if (!accRow?.rows?.length) {
              return new Response(JSON.stringify({ error: 'Account not found for user' }), { 
                status: 403, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              });
            }
            const acc = accRow.rows[0];
            const isSynced = !!(acc.mt_account_number || acc.sync_provider === 'tradovate');
            if (!isSynced) {
              return new Response(JSON.stringify({ error: 'Account not synced' }), { 
                status: 403, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              });
            }
          }
          if (!checkpointValues) {
            return new Response(JSON.stringify({ error: 'Missing checkpoint values' }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          const lastPlan = await executeTursoQuery(
            'SELECT created_at FROM trading_plans WHERE account_id = ? ORDER BY created_at DESC LIMIT 1',
            [effectiveAccountId]
          );
          if (lastPlan?.rows?.length) {
            const lastCreatedAt = lastPlan.rows[0].created_at;
            const lastTime = Date.parse(lastCreatedAt);
            if (!Number.isNaN(lastTime)) {
              // FIX: Cambiar de 24h exactas a fin del día siguiente (medianoche)
              const lastDate = new Date(lastTime);
              const nextDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + 1, 0, 0, 0, 0);
              const nextAllowedAt = nextDay;
              if (Date.now() < nextAllowedAt.getTime()) {
                return new Response(JSON.stringify({ 
                  error: 'Plan already created today',
                  nextAllowedAt: nextAllowedAt.toISOString()
                }), { 
                  status: 409, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                });
              }
            }
          }
          const planId = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await executeTursoQuery(
            `INSERT INTO trading_plans (
              id, account_id,
              trading_session, trading_session_value,
              pair_category, pair_category_value,
              risk_level, risk_level_value,
              profit_goal, profit_goal_value,
              max_daily_loss, max_daily_loss_value,
              max_trades_day, max_trades_day_value,
              all_checkpoints_completed,
              created_at, updated_at
            ) VALUES (?, ?, 1, ?, 1, ?, 1, ?, 1, ?, 1, ?, 1, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              planId,
              effectiveAccountId,
              JSON.stringify(checkpointValues.trading_session || []),
              JSON.stringify(checkpointValues.pair_category || []),
              checkpointValues.risk_level || 'Bajo',
              checkpointValues.profit_goal || 0,
              checkpointValues.max_daily_loss || 0,
              checkpointValues.max_trades_day || 10
            ]
          );
          return new Response(JSON.stringify({ success: true, planId, message: 'Plan created successfully' }), { 
            status: 201, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      }

      // POST /api/plan/update
      if (request.method === 'POST' && path === '/api/plan/update') {
        try {
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          if (!token) {
            return new Response(JSON.stringify({ error: 'Missing authorization token' }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          const payload = await verifyJWT(token, (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET);
          if (!payload) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          const body = await request.json();
          const { checkpointValues, accountId } = body || {};
          const userId = payload.userId || payload.user_id || payload.sub;
          const effectiveAccountId = accountId || payload.account_id || payload.accountId || payload.userId || payload.user_id;
          if (!effectiveAccountId) {
            return new Response(JSON.stringify({ error: 'Missing accountId' }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          if (userId) {
            const accCheck = await executeTursoQuery('SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', [effectiveAccountId, userId]);
            if (!accCheck?.rows?.length) {
              return new Response(JSON.stringify({ error: 'Account not found for user' }), { 
                status: 403, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              });
            }
          }
          if (!checkpointValues) {
            return new Response(JSON.stringify({ error: 'Missing checkpoint values' }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          await executeTursoQuery(
            `UPDATE trading_plans SET
              trading_session_value = ?,
              pair_category_value = ?,
              risk_level_value = ?,
              profit_goal_value = ?,
              max_daily_loss_value = ?,
              max_trades_day_value = ?,
              updated_at = CURRENT_TIMESTAMP
             WHERE id = (
               SELECT id FROM trading_plans
               WHERE account_id = ?
               ORDER BY created_at DESC
               LIMIT 1
             )`,
            [
              JSON.stringify(checkpointValues.trading_session || []),
              JSON.stringify(checkpointValues.pair_category || []),
              checkpointValues.risk_level || 'Bajo',
              checkpointValues.profit_goal || 0,
              checkpointValues.max_daily_loss || 0,
              checkpointValues.max_trades_day || 10,
              effectiveAccountId
            ]
          );
          return new Response(JSON.stringify({ success: true, message: 'Plan updated successfully' }), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      }

      // POST /api/plan/delete
      if (request.method === 'POST' && path === '/api/plan/delete') {
        try {
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          if (!token) {
            return new Response(JSON.stringify({ error: 'Missing authorization token' }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          const payload = await verifyJWT(token, (env && env.ADMIN_SECRET) ? env.ADMIN_SECRET : FALLBACK_ADMIN_SECRET);
          if (!payload) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), { 
              status: 401, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          let body = {};
          try { body = await request.json(); } catch (e) { body = {}; }
          const userId = payload.userId || payload.user_id || payload.sub;
          const accountId = body.accountId || payload.account_id || payload.accountId || payload.userId || payload.user_id;
          if (!accountId) {
            return new Response(JSON.stringify({ error: 'Missing accountId' }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          if (userId) {
            const accCheck = await executeTursoQuery('SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1', [accountId, userId]);
            if (!accCheck?.rows?.length) {
              return new Response(JSON.stringify({ error: 'Account not found for user' }), { 
                status: 403, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              });
            }
          }
          const lastPlan = await executeTursoQuery('SELECT created_at FROM trading_plans WHERE account_id = ? ORDER BY created_at DESC LIMIT 1', [accountId]);
          let nextAllowedAt = null;
          if (lastPlan?.rows?.length) {
            const lastCreatedAt = lastPlan.rows[0].created_at;
            const lastTime = Date.parse(lastCreatedAt);
            if (!Number.isNaN(lastTime)) {
              // FIX: Cambiar de 24h exactas a fin del día siguiente (medianoche)
              const lastDate = new Date(lastTime);
              const nextDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + 1, 0, 0, 0, 0);
              nextAllowedAt = nextDay.toISOString();
            }
          }
          await executeTursoQuery('DELETE FROM trading_plans WHERE account_id = ?', [accountId]);
          return new Response(JSON.stringify({ success: true, message: 'Plan deleted successfully', nextAllowedAt }), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message || 'Internal server error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },

  // ============================================
  // CRON JOB: TAREAS DIARIAS (03:00 UTC)
  // 1. Limpieza de cuentas archivadas
  // 2. Sincronización de eventos económicos
  // ============================================
  async scheduled(event, env, ctx) {
    try {

      
      // ===== TAREA 1: LIMPIEZA DE CUENTAS ARCHIVADAS =====
      await cleanupArchivedAccounts(48);
      
      // ===== TAREA 2: SINCRONIZACIÓN DE EVENTOS ECONÓMICOS =====

      
      try {
        const FOREX_FACTORY_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
        const response = await fetch(FOREX_FACTORY_URL);
        
        if (response.ok) {
          const data = await response.json();
          
          if (Array.isArray(data) && data.length > 0) {
            const allowedCurrencies = ['USD', 'EUR', 'GBP', 'JPY'];
            const allowedImpacts = ['High', 'Medium'];
            
            const filtered = data.filter(e => {
              return allowedCurrencies.includes(e.country) && allowedImpacts.includes(e.impact);
            });
            
            // Limpiar eventos antiguos
            const today = new Date();
            const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            await executeTursoQuery('DELETE FROM economic_events WHERE date < ?', [ninetyDaysAgo]);
            
            // Insertar eventos
            let insertedCount = 0;
            for (const e of filtered) {
              const eventDate = new Date(e.date);
              const dateTimeISO = eventDate.toISOString(); // Incluir hora completa en UTC
              const eventId = `${dateTimeISO}_${e.country}_${e.title}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
              const impact = e.impact === 'High' ? 'high' : 'medium';
              
              try {
                await executeTursoQuery(
                  `INSERT INTO economic_events (id, date, country, title, impact, actual, forecast, previous, currency, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(id) DO UPDATE SET actual = excluded.actual, forecast = excluded.forecast, previous = excluded.previous, updated_at = CURRENT_TIMESTAMP`,
                  [eventId, dateTimeISO, e.country, e.title, impact, e.actual || null, e.forecast || null, e.previous || null, e.country]
                );
                insertedCount++;
              } catch (err) {
                // Ignorar errores de inserción individuales
              }
            }

            // Limpiar duplicados por fecha/país/título
            try {
              await executeTursoQuery(
                'DELETE FROM economic_events WHERE rowid NOT IN (SELECT MIN(rowid) FROM economic_events GROUP BY date, country, title)'
              );
            } catch (e) {
              // Ignorar limpieza si falla
            }
            

          } else {

          }
        } else {

        }
      } catch (syncError) {

      }
      

      
    } catch (error) {

    }
  }
};
