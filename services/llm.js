const axios = require("axios");

const generateResponse = async (query, context, conversationHistory = []) => {
  const fallback = () => {
    const top = (context || []).slice(0, 3);
    if (top.length === 0) {
      return "I couldn't find relevant context in the knowledge base for that query. Try asking about recently ingested news topics.";
    }
    const bullets = top
      .map(
        (d, i) => `(${i + 1}) ${d.title} — ${d.source}${d.summary ? `: ${d.summary}` : ""}`
      )
      .join("\n");
    return `Here's what I found related to your query based on recent articles:\n${bullets}\n\nAsk a follow-up for more details on any of the above.`;
  };

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return fallback();
    }

    const systemPrompt = `You are a helpful news assistant. Answer questions based on the provided news context. 
    If the context doesn't contain relevant information, say so politely and suggest what kind of information you can help with.
    
    Context from news articles:
    ${context
      .map(
        (doc) =>
          `Title: ${doc.title}\nContent: ${doc.content}\nSource: ${doc.source}\n`
      )
      .join("\n---\n")}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-6),
      { role: "user", content: query },
    ];

    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: messages.map((msg) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        })),
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const text = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || fallback();
  } catch (error) {
    console.error("Error generating LLM response:", error?.response?.data || error.message);
    return fallback();
  }
};

const generateStreamingResponse = async (
  query,
  context,
  conversationHistory = []
) => {
  // For streaming, we'll simulate it by chunking the response
  const fullResponse = await generateResponse(
    query,
    context,
    conversationHistory
  );

  return {
    text: fullResponse,
    chunks: chunkText(fullResponse, 10), // Split into chunks for streaming effect
  };
};

const chunkText = (text, wordsPerChunk) => {
  const words = text.split(" ");
  const chunks = [];

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }

  return chunks;
};

module.exports = {
  generateResponse,
  generateStreamingResponse,
};
