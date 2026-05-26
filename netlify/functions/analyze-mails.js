exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { mails } = JSON.parse(event.body);
    if (!mails || mails.length === 0) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ todos: [] }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const sample = mails.slice(0, 10).map(m => ({
      id: m.id,
      betreff: m.betreff || "(kein Betreff)",
      absender: m.absender || "",
      datum: m.datum || "",
      text: (m.text || "").slice(0, 200)
    }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: `Gib ALLE diese E-Mails als JSON-Array zurück. Keine Ausnahmen. Alle ${sample.length} Mails müssen im Output erscheinen.

Format (NUR JSON, kein Markdown):
[{"id":"EXAKTE-ID","aufgabe":"Betreff der Mail","vorschau":"Von wem","details":"Mailinhalt","absender":"email","datum":"datum","prioritaet":"mittel","kategorie":"Sonstiges"}]

Mails: ${JSON.stringify(sample)}` }]
      })
    });

    const data = await res.json();
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "[]";
    let todos = [];
    const match = text.replace(/\`\`\`json|\`\`\`/g, "").trim().match(/\[[\s\S]*\]/);
    if (match) { try { todos = JSON.parse(match[0]); } catch(e) {} }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ todos }) };
  } catch(e) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) };
  }
};
