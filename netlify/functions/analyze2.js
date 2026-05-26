exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const { mails } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const sample = (mails || []).slice(0, 3).map((m, i) => ({
      id: "mail" + i, betreff: m.betreff || "kein Betreff",
      absender: m.absender || "", text: (m.text || "").slice(0, 100)
    }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: `Gib diese 3 Mails als JSON-Array zurück. NUR JSON, kein Markdown:
[{"id":"mail0","aufgabe":"Aufgabe","vorschau":"Vorschau","details":"Details","absender":"email","datum":"datum","prioritaet":"mittel","kategorie":"Sonstiges"}]

Mails: ${JSON.stringify(sample)}` }]
      })
    });

    const data = await res.json();
    const rawText = data.content?.[0]?.text || "";

    // Return raw text so we can see what Claude says
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos: [], rawText: rawText.slice(0, 500) })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
