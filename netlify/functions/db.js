// db.js – Google Sheets als Datenbank für PhysioPro Mail Todos
// Tabs: todos | notizen | erinnerungen

const { google } = require("googleapis");

const SHEET_ID = process.env.TODOS_SHEET_ID;

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return auth.getClient();
}

async function getSheets() {
  const auth = await getAuth();
  return google.sheets({ version: "v4", auth });
}

// ── TODOS ──────────────────────────────────────────────────────
async function getTodos() {
  const sheets = await getSheets();
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "todos!A2:Z" });
  const rows = r.data.values || [];
  return rows.map(row => ({
    mailId:           row[0] || "",
    aufgabe:          row[1] || "",
    vorschau:         row[2] || "",
    details:          row[3] || "",
    absender:         row[4] || "",
    datum:            row[5] || "",
    prioritaet:       row[6] || "mittel",
    kategorie:        row[7] || "Sonstiges",
    anzahl:           parseInt(row[8]) || 1,
    status:           row[9] || "todo",
    original_betreff: row[10] || "",
    webLink:          row[11] || "",
    alreadyReplied:   row[12] === "true",
    antwort_betreff:  row[13] || "",
    antwort_text:     row[14] || "",
    notiz:            row[15] || "",
    erinnerung:       row[16] || "",
    createdAt:        row[17] || new Date().toISOString(),
  }));
}

async function upsertTodo(todo) {
  const sheets = await getSheets();
  // Check if mailId exists
  const existing = await getTodos();
  const idx = existing.findIndex(t => t.mailId === todo.mailId);
  const row = [
    todo.mailId, todo.aufgabe, todo.vorschau, todo.details,
    todo.absender, todo.datum, todo.prioritaet, todo.kategorie,
    todo.anzahl || 1, todo.status || "todo", todo.original_betreff || "",
    todo.webLink || "", todo.alreadyReplied ? "true" : "false",
    todo.antwort_betreff || "", todo.antwort_text || "",
    todo.notiz || "", todo.erinnerung || "",
    todo.createdAt || new Date().toISOString()
  ];
  if (idx >= 0) {
    // Update existing row (row index = idx + 2 because of header)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `todos!A${idx + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: [row] }
    });
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "todos!A:A",
      valueInputOption: "RAW",
      requestBody: { values: [row] }
    });
  }
}

async function updateTodoField(mailId, field, value) {
  const existing = await getTodos();
  const idx = existing.findIndex(t => t.mailId === mailId);
  if (idx < 0) return;
  const todo = { ...existing[idx], [field]: value };
  await upsertTodo(todo);
}

async function deleteTodo(mailId) {
  const sheets = await getSheets();
  const existing = await getTodos();
  const idx = existing.findIndex(t => t.mailId === mailId);
  if (idx < 0) return;
  // Clear the row
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `todos!A${idx + 2}:R${idx + 2}`
  });
}

async function getPendingReminders() {
  const todos = await getTodos();
  const now = new Date();
  return todos.filter(t =>
    t.erinnerung && new Date(t.erinnerung) <= now && t.status !== "done"
  );
}

module.exports = { getTodos, upsertTodo, updateTodoField, deleteTodo, getPendingReminders };
