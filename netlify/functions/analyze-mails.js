exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const mails = body.mails || [];

    if (mails.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todos: [] })
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    // Trim payload: max 80 mails, max 300 chars per body
    const sample = mails.slice(0, 80).map(m => ({
      id: m.id,
      betreff: m.betreff,
      absender: m.absender,
      datum: m.datum,
      text: (m.text || "").slice(0, 300)
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: `Du analysierst E-Mails einer Physiotherapiepraxis (PhysioPro Lübeck) und extrahierst daraus konkrete Aufgaben/Todos.
Antworte NUR mit einem JSON-Array ohne Markdown-Backticks, ohne Präambel:
[{"id":"exakte-mail-id","aufgabe":"Was tun im Imperativ (max 70 Zeichen)","vorschau":"1-2 Sätze Kontext (max 120 Zeichen)","details":"Vollständiger Kontext (max 300 Zeichen)","absender":"email@example.de","datum":"2025-01-01","prioritaet":"hoch|mittel|niedrig","kategorie":"Termin|Patient|Rechnung|Krankenversicherung|Anfrage|Personal|Lieferung|Sonstiges"}]
Prioritäten: hoch=zeitkritisch/heute/Beschwerden, mittel=Terminanfragen/normale Anfragen, niedrig=allgemeine Infos.
NUR Mails ausgeben die eine Aktion erfordern. Automatische Bestätigungen, Newsletter, Spam weglassen.
Falls keine Todo-Mails vorhanden: gib [] zurück.`,
        messages: [{
          role: "user",
          content: `Analysiere diese ${sample.length} E-Mails:\n${JSON.stringify(sample)}`
        }]
      })
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Anthropic ${response.status}: ${responseText.slice(0, 300)}`);
    }

    const data = JSON.parse(responseText);
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "[]";

    let todos = [];
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) todos = JSON.parse(match[0]);
    } catch (e) {
      console.error("Parse error:", e.message, "Raw:", text.slice(0, 300));
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos })
    };

  } catch (e) {
    console.error("FUNCTION ERROR:", e.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message })
    };
  }
};
