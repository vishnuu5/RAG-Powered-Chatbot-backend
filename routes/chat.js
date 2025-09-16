const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { generateEmbedding } = require("../services/embeddings");
const {
  generateResponse,
  generateStreamingResponse,
} = require("../services/llm");
const { searchSimilarDocuments } = require("../config/vectordb");
const { saveSessionMessage, getSessionMessages } = require("../config/redis");

const router = express.Router();

router.post("/message", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res
        .status(400)
        .json({ error: "Message and sessionId are required" });
    }
    await saveSessionMessage(sessionId, message, "user");

    const queryEmbedding = await generateEmbedding(message);

    let similarDocs = [];
    if (queryEmbedding) {
      similarDocs = await searchSimilarDocuments(queryEmbedding, 5);
    } else {
      const { getAnyDocuments } = require("../config/vectordb");
      similarDocs = await getAnyDocuments(5);
    }

    const history = await getSessionMessages(sessionId);
    const conversationHistory = history.slice(-10).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Generate response using LLM
    const response = await generateResponse(
      message,
      similarDocs,
      conversationHistory
    );

    // Save assistant response
    await saveSessionMessage(sessionId, response, "assistant");

    res.json({
      response,
      sources: similarDocs.map((doc) => ({
        title: doc.title,
        url: doc.url,
        source: doc.source,
        relevanceScore: doc.score,
      })),
    });
  } catch (error) {
    console.error("Error in chat message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Streaming chat endpoint
router.post("/stream", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res
        .status(400)
        .json({ error: "Message and sessionId are required" });
    }

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    // Save user message
    await saveSessionMessage(sessionId, message, "user");

    // Generate embedding and search
    const queryEmbedding = await generateEmbedding(message);
    let similarDocs = [];
    if (queryEmbedding) {
      similarDocs = await searchSimilarDocuments(queryEmbedding, 5);
    } else {
      const { getAnyDocuments } = require("../config/vectordb");
      similarDocs = await getAnyDocuments(5);
    }
    const history = await getSessionMessages(sessionId);
    const conversationHistory = history.slice(-10).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Generate streaming response
    const { text: fullResponse, chunks } = await generateStreamingResponse(
      message,
      similarDocs,
      conversationHistory
    );

    // Send chunks with delay to simulate streaming
    for (let i = 0; i < chunks.length; i++) {
      res.write(
        `data: ${JSON.stringify({ chunk: chunks[i], isComplete: false })}\n\n`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    res.write(
      `data: ${JSON.stringify({
        chunk: "",
        isComplete: true,
        sources: similarDocs.map((doc) => ({
          title: doc.title,
          url: doc.url,
          source: doc.source,
          relevanceScore: doc.score,
        })),
      })}\n\n`
    );

    // Save complete response
    await saveSessionMessage(sessionId, fullResponse, "assistant");

    res.end();
  } catch (error) {
    console.error("Error in streaming chat:", error);
    res.write(
      `data: ${JSON.stringify({ error: "Internal server error" })}\n\n`
    );
    res.end();
  }
});

module.exports = router;
