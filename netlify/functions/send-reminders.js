// send-reminders.js – Scheduled Function alle 5 Min
// Prüft fällige Erinnerungen und sendet Mail via Microsoft Graph (App-only)
const { getToken: getSheetToken, getDueReminders, updateField } = require('./db');

exports.handler = async () => {
  try {
    const sheetToken = await getSheetToken();
    const due = await getDueReminders(sheetToken);
    if (!due.length) return { statusCode: 200, body: 'No reminders due' };

    // Graph Token via client_credentials
    const tenantId     = process.env.AZURE_TENANT_ID;
    const clientId     = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const senderEmail  = process.env.REMINDER_SENDER || 'info@physioproluebeck.de';

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default'
        })
      }
    );
    const { access_token } = await tokenRes.json();
    if (!access_token) throw new Error('Graph Token fehlgeschlagen');

    let sent = 0;
    for (const todo of due) {
      try {
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: '⏰ Erinnerung: ' + todo.aufgabe,
              body: {
                contentType: 'HTML',
                content: `
                  <h3 style="color:#2c2825">⏰ Erinnerung aus PhysioPro Todos</h3>
                  <p><strong>Aufgabe:</strong> ${todo.aufgabe}</p>
                  <p><strong>Was ist passiert:</strong> ${todo.vorschau}</p>
                  <p><strong>Von:</strong> ${todo.absender}</p>
                  ${todo.notiz ? `<p><strong>Deine Notiz:</strong> ${todo.notiz}</p>` : ''}
                  <p><strong>Erinnerung war gesetzt für:</strong> ${new Date(todo.erinnerung).toLocaleString('de-DE')}</p>
                  <hr>
                  <p style="font-size:12px;color:#888">PhysioPro Todos · ${senderEmail}</p>
                `
              },
              toRecipients: [{ emailAddress: { address: senderEmail } }]
            }
          })
        });
        if (res.ok || res.status === 202) {
          await updateField(sheetToken, todo.mailId, 'erinnerung', '');
          sent++;
          console.log('Reminder sent:', todo.aufgabe);
        }
      } catch(e) { console.error('Reminder failed:', todo.mailId, e.message); }
    }

    return { statusCode: 200, body: `Sent ${sent}/${due.length} reminders` };
  } catch(e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  }
};
