exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const body = JSON.parse(event.body);
    const mails = body.mails || [];
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const sample = mails.slice(0, 3).map(m => ({
      id: m.id,
      betreff: m.betreff || "(kein Betreff)",
      absender: m.absender || "",
      datum: m.datum || "",
      text: (m.text || "").slice(0, 100)
    }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: `Return these 3 emails as JSON array. Include ALL. No markdown.
[{"id":"EXACT_ID","aufgabe":"task","vorschau":"preview","details":"details","absender":"email","datum":"date","prioritaet":"mittel","kategorie":"Sonstiges"}]
Emails: ${JSON.stringify(sample)}` }]
      })
    });

    const data = await res.json();
    const rawText = (data.content?.[0]?.text || "").trim();
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    
    let todos = [];
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { todos = JSON.parse(match[0]); } catch(e) {}
    }

    // Return raw text so frontend can show it
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos, rawText: rawText.slice(0, 400) })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
