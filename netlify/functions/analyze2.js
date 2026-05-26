exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const body = JSON.parse(event.body);
    const mails = body.mails || [];
    const apiKey = process.env.ANTHROPIC_API_KEY;

    // Just return first mail raw so we can see what arrives
    const firstMail = mails[0] || {};
    
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: `Reply with exactly this JSON and nothing else:
[{"id":"${firstMail.id || 'test'}","aufgabe":"Test Todo","vorschau":"Test","details":"Test","absender":"${firstMail.absender || 'test@test.de'}","datum":"2026-05-26","prioritaet":"mittel","kategorie":"Sonstiges"}]` }]
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

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        todos,
        debug: { mailsIn: mails.length, firstId: firstMail.id, rawText: rawText.slice(0,200) }
      })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
