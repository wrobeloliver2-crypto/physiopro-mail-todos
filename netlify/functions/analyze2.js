exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const { mails } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const idMap = {};
    const sample = (mails || []).slice(0, 20).map((m, i) => {
      idMap["mail" + i] = m.id;
      return { id: "mail" + i, betreff: m.betreff || "kein Betreff", absender: m.absender || "", datum: m.datum || "", text: (m.text || "").slice(0, 150) };
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: `Gib ALLE ${sample.length} E-Mails als JSON-Array zurück. Jede Mail muss erscheinen.
WICHTIG: Kein Markdown, keine Backticks, nur reines JSON beginnen mit [

[{"id":"mail0","aufgabe":"Betreff","vorschau":"Absender","details":"Text","absender":"email","datum":"datum","prioritaet":"mittel","kategorie":"Sonstiges"}]

Mails: ${JSON.stringify(sample)}` }]
      })
    });

    const data = await res.json();
    const rawText = data.content?.[0]?.text || "";
    
    // Strip ALL markdown variations
    const cleaned = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let todos = [];
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { 
        todos = JSON.parse(match[0]).map(t => ({ ...t, id: idMap[t.id] || t.id }));
      } catch(e) { console.error("Parse error:", e.message); }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
