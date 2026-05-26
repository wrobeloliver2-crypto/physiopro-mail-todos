// todos-api.js – CRUD Endpunkt für Todos
const { getToken, readAll, upsertTodo, updateField, clearRow } = require('./db');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getToken();
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    // GET – alle aktiven Todos laden
    if (method === 'GET') {
      const todos = await readAll(token);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ todos }) };
    }

    if (method === 'POST') {
      const { action, mailId, field, value, todos } = body;

      // Bulk upsert nach KI-Analyse
      if (action === 'bulk_upsert' && todos) {
        for (const t of todos) {
          await upsertTodo(token, { ...t, mailId: t.mailId || t.id });
        }
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, count: todos.length }) };
      }

      // Einzelnes Feld updaten (status, notiz, erinnerung)
      if (action === 'update_field' && mailId && field !== undefined) {
        await updateField(token, mailId, field, value || '');
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      }

      // Todo löschen (Zeile leeren)
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
