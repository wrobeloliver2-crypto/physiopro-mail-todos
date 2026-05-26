exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { mails = [] } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const idMap = {};
    // Max 10 mails to stay within 10s Netlify timeout
    const sample = mails.slice(0, 10).map((m, i) => {
      const shortId = "m" + i;
      idMap[shortId] = m.id;
      return { id: shortId, betreff: m.betreff || "", absender: m.absender || "", datum: m.datum || "", text: (m.text || "").slice(0, 300) };
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 6000,
        system: `Du bist ein Assistent für die Physiotherapiepraxis PhysioPro Lübeck.

REGEL: Wandle JEDE Mail in ein Todo um. Keine Diskussion. Nur 3 Ausnahmen:
1. Newsletter / Massen-Werbemail (kein persönlicher Bezug)
2. Absender oder Betreff enthält "getmyinvoices"
3. Reine technische Statusmails (z.B. "Backup OK")

Alle anderen Mails → Todo. Immer. Auch wenn Handlungsbedarf unklar.

ANTWORT: Wenn die Mail eine Antwort von der Praxis erwartet → antwort_betreff + antwort_text ausfüllen (professionell, freundlich, auf Deutsch, Unterschrift "Mit freundlichen Grüßen\nIhr PhysioPro Lübeck Team"). Nur bei rein internen Aufgaben → null.

DEDUPLIZIERUNG: Gleiche Mails vom gleichen Absender → eine Karte, neueste ID.

JSON-Felder: id, aufgabe, vorschau, details, absender, datum, prioritaet (hoch/mittel/niedrig), kategorie (Finanzen|Mitgliedschaften|Kundenanfragen|Dokumentenanfragen|Personalwesen|Kundenfollow-up|Behörden|Sonstiges), anzahl, antwort_betreff, antwort_text

Nur JSON-Array zurückgeben, kein Text drumherum.`,
        messages: [{ role: "user", content: `Mails (ALLE außer Newsletter/GetMyInvoices/Systemmeldungen als Todo erfassen):\n\n${JSON.stringify(sample)}` }]
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
