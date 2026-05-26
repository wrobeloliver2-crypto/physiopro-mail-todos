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
      return { id: shortId, betreff: m.betreff || "", absender: m.absender || "", datum: m.datum || "", text: (m.text || "").slice(0, 200) };
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: `Du analysierst E-Mails einer Physiotherapiepraxis (PhysioPro Lübeck) und erstellst klare, handlungsorientierte Todos.

IGNORIERE folgende Mail-Typen komplett (gib sie NICHT zurück):
- Automatische Benachrichtigungen von GetMyInvoices (Absender enthält "getmyinvoices" oder Betreff enthält "Benachrichtigung" + "GetMyInvoices")
- Reine Bestätigungsmails ohne Handlungsbedarf
- Newsletter, Marketing-Mails
- Automatische Systembenachrichtigungen ohne konkreten Handlungsbedarf

DEDUPLIZIERUNG: Wenn mehrere Mails dasselbe Thema betreffen (z.B. mehrere fehlgeschlagene Zahlungen desselben Typs, mehrere Probetraining-Anfragen), fasse sie zu EINER Karte zusammen. Verwende die ID der neuesten Mail. Füge im Feld "anzahl" die Anzahl der zusammengefassten Mails ein (1 wenn nur eine).

Für jede Mail MIT echtem Handlungsbedarf:
- "aufgabe": Präzise Handlungsanweisung (z.B. "Rücklastschrift Julia Pawellek prüfen und Zahlung klären" statt nur "Zahlungsausfall beheben")
- "vorschau": 1 Satz was konkret passiert ist (z.B. "Membership-Abbuchung €X fehlgeschlagen – Konto nicht gedeckt")
- "details": Konkreter Handlungsplan: Was genau tun? Wen kontaktieren? Welche Nummer/Referenz? Zeitrahmen?
- "absender": E-Mail-Adresse
- "datum": Datum der neuesten Mail
- "prioritaet": "hoch" (Zahlung, dringend), "mittel" (Kundenanfrage), "niedrig" (Info)
- "kategorie": Eine von: Finanzen, Mitgliedschaften, Kundenanfragen, Personalwesen, Kundenfollow-up, Sonstiges
- "anzahl": Anzahl zusammengefasster Mails (Zahl)

Antworte NUR mit reinem JSON-Array (kein Markdown, keine Backticks):
[{"id":"m0","aufgabe":"...","vorschau":"...","details":"...","absender":"email","datum":"datum","prioritaet":"mittel","kategorie":"Finanzen","anzahl":1}]`,
        messages: [{ role: "user", content: `Analysiere diese Mails und gib alle mit echtem Handlungsbedarf zurück (ignoriere automatische Benachrichtigungen):\n${JSON.stringify(sample)}` }]
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
