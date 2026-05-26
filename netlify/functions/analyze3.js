exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { mails = [] } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;

    // Map long Outlook IDs to short ones
    const idMap = {};
    const sample = mails.slice(0, 20).map((m, i) => {
      const shortId = "m" + i;
      idMap[shortId] = m.id;
      return { id: shortId, betreff: m.betreff || "", absender: m.absender || "", datum: m.datum || "", text: (m.text || "").slice(0, 150) };
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: `Du analysierst E-Mails einer Physiotherapiepraxis. Extrahiere alle Mails mit Handlungsbedarf.
Antworte NUR mit reinem JSON-Array (kein Markdown, keine Backticks):
[{"id":"m0","aufgabe":"Aufgabe","vorschau":"Vorschau","details":"Details","absender":"email","datum":"datum","prioritaet":"mittel","kategorie":"Sonstiges"}]`,
        messages: [{ role: "user", content: `Analysiere diese Mails und gib alle mit Handlungsbedarf zurück:\n${JSON.stringify(sample)}` }]
      })
    });

    const data = await res.json();
    const rawText = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
    
    let todos = [];
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        todos = JSON.parse(match[0]).map(t => ({ ...t, id: idMap[t.id] || t.id }));
      } catch(e) { console.error("Parse error:", e.message); }
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ todos }) };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
