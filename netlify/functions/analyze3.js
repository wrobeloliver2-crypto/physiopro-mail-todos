exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { mails = [] } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const idMap = {};
    const sample = mails.slice(0, 20).map((m, i) => {
      const shortId = "m" + i;
      idMap[shortId] = m.id;
      return { id: shortId, betreff: m.betreff || "", absender: m.absender || "", datum: m.datum || "", text: (m.text || "").slice(0, 200) };
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 6000,
        system: `Du analysierst E-Mails einer Physiotherapiepraxis (PhysioPro Lübeck).

GRUNDREGEL: Jede Mail ist ein Todo – es sei denn, sie fällt eindeutig in eine der folgenden Ausnahmen.

IGNORIERE NUR:
- Newsletter und reine Werbe-/Marketing-Mails ohne konkreten Bezug zur Praxis
- Automatische Benachrichtigungen von GetMyInvoices (Absender/Betreff enthält "getmyinvoices")
- Automatische System-Statusmeldungen ohne Handlungsbedarf (z.B. "Backup erfolgreich", "Server OK")

ALLES ANDERE wird als Todo erfasst – auch wenn der Handlungsbedarf unklar erscheint. Im Zweifel immer erfassen.

DEDUPLIZIERUNG: Mehrere Mails zum exakt gleichen Thema vom gleichen Absender → eine Karte, ID der neuesten Mail, "anzahl" = Anzahl.

Für jedes Todo:
- "aufgabe": Konkrete Handlungsanweisung, mit Name/Details wenn erkennbar
- "vorschau": 1 Satz was die Person schreibt oder was passiert ist
- "details": Was genau tun? Wen kontaktieren? Welche Unterlagen/Referenz? Zeitrahmen?
- "absender": E-Mail-Adresse
- "datum": Datum der (neuesten) Mail
- "prioritaet": "hoch" (Zahlung/Frist/dringend), "mittel" (Anfrage/Antwort erwartet), "niedrig" (Info/kein Zeitdruck)
- "kategorie": Finanzen | Mitgliedschaften | Kundenanfragen | Dokumentenanfragen | Personalwesen | Kundenfollow-up | Behörden | Sonstiges
- "anzahl": Anzahl zusammengefasster Mails
- "antwort_betreff": Betreff für Antwort-Mail wenn eine Antwort sinnvoll ist, sonst null
- "antwort_text": Fertiger deutscher E-Mail-Entwurf wenn eine Antwort sinnvoll ist, sonst null. Anrede mit Namen wenn bekannt, Unterschrift "Mit freundlichen Grüßen\\nIhr PhysioPro Lübeck Team"

Antworte NUR mit reinem JSON-Array (kein Markdown, keine Backticks):
[{"id":"m0","aufgabe":"...","vorschau":"...","details":"...","absender":"email","datum":"datum","prioritaet":"mittel","kategorie":"Sonstiges","anzahl":1,"antwort_betreff":null,"antwort_text":null}]`,
        messages: [{ role: "user", content: `Hier sind die E-Mails. Erfasse ALLE als Todo außer Newsletter, GetMyInvoices-Mails und automatische Systemmeldungen:\n${JSON.stringify(sample)}` }]
      })
    });

    const data = await res.json();
    const rawText = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();

    let todos = [];
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        todos = JSON.parse(match[0]).map(t => ({ ...t, id: idMap[t.id] || t.id, anzahl: t.anzahl || 1 }));
      } catch(e) { console.error("Parse error:", e.message); }
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ todos }) };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
