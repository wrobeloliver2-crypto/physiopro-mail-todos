const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: `Du analysierst E-Mails einer Physiotherapiepraxis (PhysioPro Lübeck) und extrahierst daraus konkrete Aufgaben/Todos.

Du erhältst eine Liste von E-Mails und entscheidest eigenständig:
1. Welche Mails eine konkrete Aktion erfordern (nur diese werden als Todo ausgegeben)
2. Wie dringend die Aktion ist
3. Was genau zu tun ist

Antworte NUR mit einem JSON-Array, ohne Markdown-Backticks, ohne Präambel, ohne Erklärungen:
[
  {
    "id": "exakte-mail-id-aus-der-eingabe",
    "aufgabe": "Kurze klare Aufgabe in Imperativ (max 70 Zeichen, z.B. 'Termin für Müller bestätigen')",
    "vorschau": "1-2 Sätze Kontext (max 120 Zeichen)",
    "details": "Vollständiger Kontext und alle relevanten Infos aus der Mail (max 300 Zeichen)",
    "absender": "absender@example.de",
    "datum": "2025-05-25",
    "prioritaet": "hoch|mittel|niedrig",
    "kategorie": "Termin|Patient|Rechnung|Krankenversicherung|Anfrage|Personal|Lieferung|Sonstiges"
  }
]

Prioritätsregeln:
- hoch: Zeitkritisch (heute/morgen), Beschwerden/Reklamationen, überfällige Rechnungen, Notfälle
- mittel: Terminanfragen, normale Patientenanfragen, Rechnungsklärungen, Lieferankündigungen
- niedrig: Allgemeine Infos, Newsletter-ähnliches, keine direkte Frist

Mails die KEIN Todo brauchen (weglassen):
- Automatische Bestätigungsmails
- Newsletter / Marketing
- Reine Informationsmails ohne Handlungsbedarf
- Spam

Wenn keine Mail ein Todo erfordert, gib [] zurück.`,
      messages: [
        {
          role: "user",
          content: `Analysiere diese ${mails.length} E-Mails und extrahiere Todos:\n\n${JSON.stringify(mails, null, 2)}`
        }
      ]
    });

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    let todos = [];
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) todos = JSON.parse(match[0]);
    } catch (e) {
      console.error("JSON parse error:", e, "Raw:", text);
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
