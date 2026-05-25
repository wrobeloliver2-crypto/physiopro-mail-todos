exports.handler = async (event) => {
  // Test: just call Anthropic directly
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [{ role: "user", content: "Say OK" }]
      })
    });
    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        status: response.status, 
        ok: response.ok,
        result: data.content?.[0]?.text || data
      })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
