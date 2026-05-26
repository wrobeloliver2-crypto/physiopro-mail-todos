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
    const sample = mails.slice(0, 20).map(m => ({
      id: m.id,
      betreff: m.betreff || "(kein Betreff)",
      absender: m.absender || "",
      datum: m.datum || "",
      text: (m.text || "").slice(0, 200)
    }));

    const prompt = `Du bekommst E-Mails. Gib ALLE als JSON-Array zurück:
[{"id":"EXAKTE-ID-AUS-EINGABE","aufgabe":"Betreff","vorschau":"Absender","details":"Text","absender":"email","datum":"datum","prioritaet":"mittel","kategorie":"Sonstiges"}]
Nur reines JSON, kein Markdown. Alle ${sample.length} Mails ausgeben.
Mails: ${JSON.stringify(sample)}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await res.json();
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "[]";
    
    console.log("Claude response length:", text.length, "preview:", text.slice(0, 100));

    let todos = [];
    const match = text.replace(/```json|```/g, "").trim().match(/\[[\s\S]*\]/);
    if (match) {
      try { todos = JSON.parse(match[0]); } catch(e) { console.error("Parse error:", e.message); }
    }

    console.log("Todos found:", todos.length);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos, debug: { mailsIn: sample.length, textLen: text.length, todosOut: todos.length } })
    };

  } catch(e) {
    console.error("ERROR:", e.message);
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) };
  }
};
