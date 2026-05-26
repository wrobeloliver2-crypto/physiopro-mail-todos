// send-reminders.js – Scheduled Function, läuft alle 5 Min
// Prüft fällige Erinnerungen und sendet Mail via Microsoft Graph
const { getPendingReminders, updateTodoField } = require("./db");

exports.handler = async () => {
  try {
    const due = await getPendingReminders();
    if (!due.length) return { statusCode: 200, body: "No reminders due" };

    // Get Graph token via client credentials (app-only)
    // We use the existing Azure app credentials
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default"
        })
      }
    );
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("Token fehlgeschlagen: " + JSON.stringify(tokenData));

    const senderEmail = process.env.REMINDER_SENDER; // z.B. info@physioproluebeck.de

    for (const todo of due) {
      try {
        await fetch(`https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              subject: "⏰ Erinnerung: " + todo.aufgabe,
              body: {
                contentType: "HTML",
                content: `
                  <h3>⏰ Erinnerung aus PhysioPro Todos</h3>
                  <p><strong>Aufgabe:</strong> ${todo.aufgabe}</p>
                  <p><strong>Vorschau:</strong> ${todo.vorschau}</p>
                  <p><strong>Von:</strong> ${todo.absender}</p>
                  ${todo.notiz ? `<p><strong>Notiz:</strong> ${todo.notiz}</p>` : ""}
                  <p><strong>Erinnerung gesetzt für:</strong> ${new Date(todo.erinnerung).toLocaleString("de-DE")}</p>
                `
              },
              toRecipients: [{ emailAddress: { address: senderEmail } }]
            }
          })
        });

        // Clear reminder after sending
        await updateTodoField(todo.mailId, "erinnerung", "");
        console.log("Reminder sent for:", todo.aufgabe);
      } catch(e) {
        console.error("Failed to send reminder for", todo.mailId, e.message);
      }
    }

    return { statusCode: 200, body: `Sent ${due.length} reminders` };
  } catch(e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  }
};
