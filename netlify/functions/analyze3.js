exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const body = JSON.parse(event.body);
    const mails = body.mails || [];
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const sample = mails.slice(0, 20).map(m => ({
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
        messages: [{
          role: "user",
          content: `You are processing emails for a physiotherapy practice. 
Return ALL ${sample.length} emails as a JSON array. Every email must be included.
Output ONLY the raw JSON array starting with [ - no markdown, no backticks, no explanation.

Use this exact format:
[{"id":"COPY_EXACT_ID_FROM_INPUT","aufgabe":"brief task","vorschau":"brief context","details":"details","absender":"sender","datum":"date","prioritaet":"mittel","kategorie":"Sonstiges"}]

Here are the emails - return ALL of them:
${JSON.stringify(sample)}`
        }]
      })
    });

    const data = await res.json();
    const rawText = (data.content?.[0]?.text || "").trim();
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let todos = [];
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { todos = JSON.parse(match[0]); } catch(e) {
        console.error("Parse error:", e.message, cleaned.slice(0, 200));
      }
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
