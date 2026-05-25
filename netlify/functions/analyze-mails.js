exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { mails } = JSON.parse(event.body);

    if (!mails || mails.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todos: [] })
      };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: `Du analysierst E-Mails einer Physiotherapiepraxis (PhysioPro Lübeck) und extrahierst daraus konkrete Aufgaben/Todos.

Antworte NUR mit einem JSON-Array, ohne Markdown-Backticks, ohne Präambel:
[
  {
    "id": "exakte-mail-id-aus-der-eingabe",
    "aufgabe": "Kurze klare Aufgabe im Imperativ (max 70 Zeichen)",
    "vorschau": "1-2 Sätze Kontext (max 120 Zeichen)",
    "details": "Vollständiger Kontext aus der Mail (max 300 Zeichen)",
    "absender": "absender@example.de",
    "datum": "2025-05-25",
    "prioritaet": "hoch|mittel|niedrig",
    "kategorie": "Termin|Patient|Rechnung|Krankenversicherung|Anfrage|Personal|Lieferung|Sonstiges"
  }
]

Prioritäten: hoch=zeitkritisch/Beschwerden/heute, mittel=Terminanfragen/normale Anfragen, niedrig=allgemeine Infos.
Nur Mails die eine Aktion erfordern ausgeben. Automatische Bestätigungen, Newsletter, Spam weglassen.
Falls keine Todo-Mails: gib [] zurück.`,
        messages: [
          {
            role: "user",
            content: `Analysiere diese ${mails.length} E-Mails:\n\n${JSON.stringify(mails, null, 2)}`
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "[]";

    let todos = [];
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) todos = JSON.parse(match[0]);
    } catch (e) {
      console.error("Parse error:", e, "Raw:", text);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos })
    };

  } catch (e) {
    console.error("analyze-mails error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message })
    };
  }
};
