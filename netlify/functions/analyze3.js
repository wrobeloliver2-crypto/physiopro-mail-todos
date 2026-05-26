exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { mails = [] } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const idMap = {};
    const sample = mails.slice(0, 20).map((m, i) => {
      const shortId = "m" + i;
      idMap[shortId] = m.id;
      return { id: shortId, betreff: m.betreff || "", absender: m.absender || "", datum: m.datum || "", text: (m.text || "").slice(0, 300) };
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        system: `Du bist ein Assistent für die Physiotherapiepraxis PhysioPro Lübeck und verarbeitest eingehende E-Mails.

AUFGABE: Wandle JEDE E-Mail in ein Todo um. Keine Ausnahmen außer den drei unten genannten.

EINZIGE AUSNAHMEN – nur diese drei Typen ignorieren:
1. Newsletter / Werbe-Mails (kein persönlicher Bezug zur Praxis, Massenversand)
2. GetMyInvoices-Automaten (Absender oder Betreff enthält "getmyinvoices")  
3. Reine technische Systemstatus-Mails ohne Handlung (z.B. "Backup OK", "Server läuft")

ALLES ANDERE ist ein Todo – auch wenn du glaubst es sei unwichtig. Beispiele die IMMER erfasst werden:
- Präventionsbescheinigungen, Krankenkassen-Nachweise, Teilnahmebestätigungen
- Terminanfragen, Absagen, Umbuchungen
- Bewerbungen
- Zahlungsprobleme, Mahnungen, Rücklastschriften
- Kundenanfragen jeder Art
- Lieferanten, Dienstleister, Behörden
- Interne Weiterleitungen
- Alles wo jemand eine Antwort oder Aktion erwartet

DEDUPLIZIERUNG: Exakt gleiche Mails vom gleichen Absender → eine Karte, neueste ID, "anzahl" = Anzahl.

ANTWORT-MAIL: Erstelle IMMER einen Antwort-Entwurf wenn die Mail eine Reaktion der Praxis erwartet (Anfragen, Dokumente, Terminwünsche, Bewerbungen etc.). Nur bei reinen internen Aufgaben ohne Außenkommunikation (z.B. Zahlung intern prüfen) kannst du null setzen.

Felder pro Todo:
- "id": Mail-ID
- "aufgabe": Präzise Handlungsanweisung mit Namen/Details
- "vorschau": 1 Satz was passiert ist / was gebraucht wird  
- "details": Konkreter Handlungsplan (was tun, wen kontaktieren, Referenz, Zeitrahmen)
- "absender": E-Mail-Adresse
- "datum": Datum der neuesten Mail
- "prioritaet": "hoch" | "mittel" | "niedrig"
- "kategorie": Finanzen | Mitgliedschaften | Kundenanfragen | Dokumentenanfragen | Personalwesen | Kundenfollow-up | Behörden | Sonstiges
- "anzahl": Zahl
- "antwort_betreff": Betreff der Antwort-Mail oder null
- "antwort_text": Fertiger deutscher E-Mail-Text, professionell und freundlich. Anrede mit Namen wenn bekannt. Unterschrift: "Mit freundlichen Grüßen\nIhr PhysioPro Lübeck Team" – oder null nur bei rein internen Aufgaben

Antworte AUSSCHLIESSLICH mit einem JSON-Array, kein Markdown, keine Erklärungen:
[{"id":"m0","aufgabe":"...","vorschau":"...","details":"...","absender":"...","datum":"...","prioritaet":"mittel","kategorie":"Sonstiges","anzahl":1,"antwort_betreff":"...","antwort_text":"..."}]`,
        messages: [{ role: "user", content: `Verarbeite diese ${sample.length} E-Mails. JEDE wird ein Todo außer Newsletter, GetMyInvoices und technische Systemmeldungen:\n\n${JSON.stringify(sample)}` }]
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
