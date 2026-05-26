const https = require('https');
const crypto = require('crypto');

const SHEET_ID     = process.env.TODOS_SHEET_ID || '1ekFnHUnj5WTGQ8yxQo_qbOJn1N5qk6x78Q28WcM1xaU';
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || 'physiopro-zeiterfassung@drop-in-ticket-umwandeln.iam.gserviceaccount.com';
const PRIVATE_KEY  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const TAB = 'todos';
const HEADERS = ['mailId','aufgabe','vorschau','details','absender','datum','prioritaet',
  'kategorie','anzahl','status','original_betreff','webLink','alreadyReplied',
  'antwort_betreff','antwort_text','notiz','erinnerung','createdAt'];

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ── JWT & Token ────────────────────────────────────────────────
function createJWT() {
  const now = Math.floor(Date.now()/1000);
  const header  = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', exp: now+3600, iat: now
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  return `${header}.${payload}.${sign.sign(PRIVATE_KEY,'base64url')}`;
}

function getToken() {
  return new Promise((resolve,reject) => {
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${createJWT()}`;
    const req = https.request({
      hostname:'oauth2.googleapis.com', path:'/token', method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':body.length}
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(d).access_token);}catch(e){reject(new Error('Token: '+d));} });
    });
    req.on('error',reject); req.write(body); req.end();
  });
}

// ── HTTP ───────────────────────────────────────────────────────
function sheetsReq(token, method, path, body) {
  return new Promise((resolve,reject) => {
    const b = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname:'sheets.googleapis.com', path, method,
      headers: Object.assign({'Authorization':`Bearer ${token}`}, b ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)} : {})
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){reject(new Error(d.slice(0,200)));} });
    });
    req.on('error',reject);
    if (b) req.write(b);
    req.end();
  });
}

// ── Sheet ops ──────────────────────────────────────────────────
async function readAll(token) {
  const data = await sheetsReq(token, 'GET', `/v4/spreadsheets/${SHEET_ID}/values/${TAB}!A2:R`, null);
  const rows = data.values || [];
  return rows.map(row => {
    const obj = {};
    HEADERS.forEach((h,i) => obj[h] = row[i] || '');
    return obj;
  }).filter(t => t.mailId && t.status !== 'archived' && t.status !== '');
}

async function ensureHeaders(token) {
  const data = await sheetsReq(token, 'GET', `/v4/spreadsheets/${SHEET_ID}/values/${TAB}!1:1`, null);
  if (!data.values || !data.values[0] || data.values[0].length === 0) {
    await sheetsReq(token, 'POST',
      `/v4/spreadsheets/${SHEET_ID}/values/${TAB}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: [HEADERS] }
    );
  }
}

// Bulk write: clear sheet and rewrite all rows in ONE call
async function bulkWrite(token, todos) {
  await ensureHeaders(token);
  // Read existing to preserve notiz/erinnerung/status
  const existing = await readAll(token);
  const existingMap = {};
  existing.forEach(t => existingMap[t.mailId] = t);

  // Merge: new todo wins except for user fields
  const merged = todos.map(t => {
    const ex = existingMap[t.mailId || t.id] || {};
    return {
      ...t,
      mailId: t.mailId || t.id,
      status: ex.status || t.status || 'todo',
      notiz: ex.notiz || t.notiz || '',
      erinnerung: ex.erinnerung || t.erinnerung || '',
    };
  });

  // Also keep existing todos not in new batch
  const newIds = new Set(merged.map(t => t.mailId));
  existing.forEach(t => { if (!newIds.has(t.mailId)) merged.push(t); });

  const rows = merged.map(t => HEADERS.map(h => String(t[h] === undefined ? '' : t[h])));

  // Clear existing data rows (keep header)
  await sheetsReq(token, 'POST',
    `/v4/spreadsheets/${SHEET_ID}/values/${TAB}!A2:R1000:clear`, {}
  );

  if (rows.length === 0) return 0;

  // Write all rows in one call
  await sheetsReq(token, 'PUT',
    `/v4/spreadsheets/${SHEET_ID}/values/${TAB}!A2?valueInputOption=RAW`,
    { values: rows }
  );
  return rows.length;
}

async function updateField(token, mailId, field, value) {
  const colIdx = HEADERS.indexOf(field);
  if (colIdx < 0) throw new Error('Unknown field: ' + field);
  // Find row
  const data = await sheetsReq(token, 'GET', `/v4/spreadsheets/${SHEET_ID}/values/${TAB}!A:A`, null);
  const rows = data.values || [];
  let rowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === mailId) { rowIdx = i + 1; break; }
  }
  if (rowIdx < 0) return;
  const col = String.fromCharCode(65 + colIdx);
  await sheetsReq(token, 'PUT',
    `/v4/spreadsheets/${SHEET_ID}/values/${TAB}!${col}${rowIdx}?valueInputOption=RAW`,
    { values: [[String(value)]] }
  );
}

async function clearRow(token, mailId) {
  const data = await sheetsReq(token, 'GET', `/v4/spreadsheets/${SHEET_ID}/values/${TAB}!A:A`, null);
  const rows = data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === mailId) {
      const rowIdx = i + 1;
      await sheetsReq(token, 'POST',
        `/v4/spreadsheets/${SHEET_ID}/values/${TAB}!A${rowIdx}:R${rowIdx}:clear`, {}
      );
      break;
    }
  }
}

// ── Handler ────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getToken();
    const body = event.body ? JSON.parse(event.body) : {};

    if (event.httpMethod === 'GET') {
      await ensureHeaders(token);
      const todos = await readAll(token);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ todos }) };
    }

    if (event.httpMethod === 'POST') {
      const { action, mailId, field, value, todos } = body;

      if (action === 'bulk_upsert' && todos) {
        const count = await bulkWrite(token, todos);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, count }) };
      }

      if (action === 'update_field' && mailId && field !== undefined) {
        await updateField(token, mailId, field, value || '');
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      }

      if (action === 'delete' && mailId) {
        await clearRow(token, mailId);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      }
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch(e) {
    console.error(e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
