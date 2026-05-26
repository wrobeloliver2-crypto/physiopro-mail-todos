// db.js – Google Sheets DB ohne externe Dependencies (gleiche Methode wie Fahrtenbuch)
const https = require('https');
const crypto = require('crypto');

const SHEET_ID     = process.env.TODOS_SHEET_ID || '1ekFnHUnj5WTGQ8yxQo_qbOJn1N5qk6x78Q28WcM1xaU';
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || 'physiopro-zeiterfassung@drop-in-ticket-umwandeln.iam.gserviceaccount.com';
const PRIVATE_KEY  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_TAB    = 'todos';

const HEADERS = ['mailId','aufgabe','vorschau','details','absender','datum','prioritaet',
  'kategorie','anzahl','status','original_betreff','webLink','alreadyReplied',
  'antwort_betreff','antwort_text','notiz','erinnerung','createdAt'];

// ── JWT & Token ────────────────────────────────────────────────
function createJWT() {
  const now = Math.floor(Date.now()/1000);
  const header  = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now+3600, iat: now
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

// ── HTTP helpers ───────────────────────────────────────────────
function sheetsGet(token, path) {
  return new Promise((resolve,reject) => {
    https.get({hostname:'sheets.googleapis.com', path, headers:{Authorization:`Bearer ${token}`}}, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){reject(new Error(d));} });
    }).on('error',reject);
  });
}

function sheetsPost(token, path, body) {
  return new Promise((resolve,reject) => {
    const b = JSON.stringify(body);
    const req = https.request({
      hostname:'sheets.googleapis.com', path, method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){reject(new Error(d));} });
    });
    req.on('error',reject); req.write(b); req.end();
  });
}

function sheetsPut(token, path, body) {
  return new Promise((resolve,reject) => {
    const b = JSON.stringify(body);
    const req = https.request({
      hostname:'sheets.googleapis.com', path, method:'PUT',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){reject(new Error(d));} });
    });
    req.on('error',reject); req.write(b); req.end();
  });
}

// ── Sheet ops ──────────────────────────────────────────────────
async function ensureHeaders(token) {
  const data = await sheetsGet(token, `/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}!1:1`);
  if (!data.values || !data.values[0] || data.values[0].length === 0) {
    await sheetsPost(token,
      `/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: [HEADERS] }
    );
  }
}

async function readAll(token) {
  const data = await sheetsGet(token, `/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}!A2:R`);
  const rows = data.values || [];
  return rows.map(row => {
    const obj = {};
    HEADERS.forEach((h, i) => obj[h] = row[i] || '');
    return obj;
  }).filter(t => t.mailId && t.status !== 'archived' && t.status !== '');
}

async function findRowIndex(token, mailId) {
  const data = await sheetsGet(token, `/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}!A:A`);
  const rows = data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === mailId) return i + 1; // 1-based, +1 for header
  }
  return -1;
}

async function upsertTodo(token, todo) {
  await ensureHeaders(token);
  const rowIdx = await findRowIndex(token, todo.mailId);
  const row = HEADERS.map(h => {
    const v = todo[h];
    if (v === undefined || v === null) return '';
    return String(v);
  });
  if (rowIdx > 0) {
    await sheetsPut(token,
      `/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}!A${rowIdx}?valueInputOption=RAW`,
      { values: [row] }
    );
  } else {
    await sheetsPost(token,
      `/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: [row] }
    );
  }
}

async function updateField(token, mailId, field, value) {
  const colIdx = HEADERS.indexOf(field);
  if (colIdx < 0) throw new Error('Unknown field: ' + field);
  const rowIdx = await findRowIndex(token, mailId);
  if (rowIdx < 0) return; // not found, skip
  const col = String.fromCharCode(65 + colIdx);
  await sheetsPut(token,
    `/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}!${col}${rowIdx}?valueInputOption=RAW`,
    { values: [[String(value)]] }
  );
}

async function clearRow(token, mailId) {
  const rowIdx = await findRowIndex(token, mailId);
  if (rowIdx < 0) return;
  await sheetsPost(token,
    `/v4/spreadsheets/${SHEET_ID}/values/${SHEET_TAB}!A${rowIdx}:R${rowIdx}:clear`,
    {}
  );
}

async function getDueReminders(token) {
  const todos = await readAll(token);
  const now = new Date();
  return todos.filter(t => t.erinnerung && new Date(t.erinnerung) <= now);
}




// send-reminders.js – Scheduled Function alle 5 Min
// Prüft fällige Erinnerungen und sendet Mail via Microsoft Graph (App-only)

exports.handler = async () => {
  try {
    const sheetToken = await getToken();
    const due = await getDueReminders(sheetToken);
    if (!due.length) return { statusCode: 200, body: 'No reminders due' };

    // Graph Token via client_credentials
    const tenantId     = process.env.AZURE_TENANT_ID;
    const clientId     = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const senderEmail  = process.env.REMINDER_SENDER || 'info@physioproluebeck.de';

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default'
        })
      }
    );
    const { access_token } = await tokenRes.json();
    if (!access_token) throw new Error('Graph Token fehlgeschlagen');

    let sent = 0;
    for (const todo of due) {
      try {
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: '⏰ Erinnerung: ' + todo.aufgabe,
              body: {
                contentType: 'HTML',
                content: `
                  <h3 style="color:#2c2825">⏰ Erinnerung aus PhysioPro Todos</h3>
                  <p><strong>Aufgabe:</strong> ${todo.aufgabe}</p>
                  <p><strong>Was ist passiert:</strong> ${todo.vorschau}</p>
                  <p><strong>Von:</strong> ${todo.absender}</p>
                  ${todo.notiz ? `<p><strong>Deine Notiz:</strong> ${todo.notiz}</p>` : ''}
                  <p><strong>Erinnerung war gesetzt für:</strong> ${new Date(todo.erinnerung).toLocaleString('de-DE')}</p>
                  <hr>
                  <p style="font-size:12px;color:#888">PhysioPro Todos · ${senderEmail}</p>
                `
              },
              toRecipients: [{ emailAddress: { address: senderEmail } }]
            }
          })
        });
        if (res.ok || res.status === 202) {
          await updateField(sheetToken, todo.mailId, 'erinnerung', '');
          sent++;
          console.log('Reminder sent:', todo.aufgabe);
        }
      } catch(e) { console.error('Reminder failed:', todo.mailId, e.message); }
    }

    return { statusCode: 200, body: `Sent ${sent}/${due.length} reminders` };
  } catch(e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  }
};
