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
        system: `Du analysierst E-Mails einer Physiotherapiepraxis (PhysioPro Lübeck) und erstellst handlungsorientierte Todos.

Im Zweifel IMMER als Todo erfassen – lieber zu viel als zu wenig.

ERFASSE ALS TODO – alle Mails bei denen jemand etwas von der Praxis braucht oder die Praxis handeln muss:
- Patientenanfragen jeder Art: Terminwünsche, Absagen, Umbuchungen, Rückfragen zur Behandlung
- Dokumentenanfragen: Teilnahmebestätigungen, Krankenkassen-Nachweise, Atteste, Rezepte, Bescheinigungen, Rechnungskopien
- Neue Bewerbungen oder Initiativbewerbungen
- Zahlungsprobleme: Rücklastschriften, fehlgeschlagene Abbuchungen, offene Rechnungen
- Membership-Ereignisse: Neukauf, Kündigung, Änderungswünsche
- Probetraining-Anfragen (auch automatische HubSpot-Benachrichtigungen dazu)
- Krankenkassen- oder Versicherungskorrespondenz
- Lieferanten- oder Dienstleister-Anfragen die eine Antwort oder Aktion erfordern
- Behörden- oder Amtspost
- Beschwerden oder Reklamationen
- Follow-up-Erinnerungen die noch offen sind
- Sonstige Mails bei denen eindeutig eine Reaktion erwartet wird

IGNORIERE NUR diese Typen (wirklich kein Handlungsbedarf):
- Automatische GetMyInvoices-Benachrichtigungen (Absender/Betreff enthält "getmyinvoices")
- Reine Zahlungsbestätigungen / Buchungsbestätigungen ohne Folgeaktion
- Newsletter und Marketing-Mails
- Automatische System-Status-Meldungen ohne Handlungsbedarf

DEDUPLIZIERUNG: Mehrere Mails zum selben Thema → eine Karte, ID der neuesten Mail, Feld "anzahl" = Anzahl.

ANTWORT-VORSCHLAG: Wenn das Todo eine Antwort per E-Mail erfordert (Terminbestätigung, Dokumentenanfrage, Rückfrage beantworten, Bewerbung bestätigen etc.), erstelle einen fertigen deutschen E-Mail-Entwurf.
- Anrede mit Namen wenn bekannt, sonst "Guten Tag,"
- Professionell aber freundlich, kurz und klar
- Passend zum Kontext (Physiotherapiepraxis)
- Unterschrift: "Mit freundlichen Grüßen\nIhr PhysioPro Lübeck Team"
- Wenn KEIN Antwort-Mail nötig (z.B. interne Aufgabe, Zahlung prüfen): "antwort_betreff" und "antwort_text" weglassen oder null setzen

Für jedes Todo:
- "aufgabe": Konkrete Handlungsanweisung mit Namen/Details wenn bekannt
- "vorschau": 1 Satz was die Person braucht oder was passiert ist
- "details": Handlungsplan – was genau tun, wen kontaktieren, welche Unterlagen, Zeitrahmen
- "absender": E-Mail-Adresse des Absenders
- "datum": Datum der (neuesten) Mail
- "prioritaet": "hoch" (Zahlung/dringend/Frist), "mittel" (Kundenanfrage/Dokument), "niedrig" (Info/kein Zeitdruck)
- "kategorie": Finanzen | Mitgliedschaften | Kundenanfragen | Dokumentenanfragen | Personalwesen | Kundenfollow-up | Behörden | Sonstiges
- "anzahl": Anzahl zusammengefasster Mails
- "antwort_betreff": Betreff für Antwort-Mail (z.B. "Re: Teilnahmebestätigung") oder null
- "antwort_text": Fertiger E-Mail-Text auf Deutsch oder null

Antworte NUR mit reinem JSON-Array (kein Markdown, keine Backticks):
[{"id":"m0","aufgabe":"...","vorschau":"...","details":"...","absender":"email","datum":"datum","prioritaet":"mittel","kategorie":"Kundenanfragen","anzahl":1,"antwort_betreff":"Re: ...","antwort_text":"Guten Tag Frau Mustermann,\\n\\nvielen Dank für Ihre Anfrage...\\n\\nMit freundlichen Grüßen\\nIhr PhysioPro Lübeck Team"}]`,
        messages: [{ role: "user", content: `Analysiere diese Mails. Erfasse ALLES bei dem jemand etwas von der Praxis erwartet oder die Praxis handeln muss. Erstelle Antwort-Entwürfe wo eine Mail-Antwort sinnvoll ist:\n${JSON.stringify(sample)}` }]
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
