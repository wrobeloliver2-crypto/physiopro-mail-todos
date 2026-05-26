// todos-api.js – CRUD Endpunkt für Todos, Notizen, Status, Erinnerungen
const { getTodos, upsertTodo, updateTodoField, deleteTodo } = require("./db");

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};
    const params = event.queryStringParameters || {};

    // GET /todos-api → alle Todos laden
    if (method === "GET") {
      const todos = await getTodos();
      // Filter out empty rows and done/deleted
      const active = todos.filter(t => t.mailId && t.status !== "archived");
      return { statusCode: 200, headers, body: JSON.stringify({ todos: active }) };
    }

    // POST /todos-api { action, ... }
    if (method === "POST") {
      const { action, mailId, todo, field, value, todos } = body;

      // Bulk upsert after KI analysis
      if (action === "bulk_upsert" && todos) {
        for (const t of todos) await upsertTodo(t);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: todos.length }) };
      }

      // Update single field (status, notiz, erinnerung)
      if (action === "update_field" && mailId && field) {
        await updateTodoField(mailId, field, value);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Delete todo
      if (action === "delete" && mailId) {
        await deleteTodo(mailId);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Full upsert single todo
      if (action === "upsert" && todo) {
        await upsertTodo(todo);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
  } catch(e) {
    console.error(e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
