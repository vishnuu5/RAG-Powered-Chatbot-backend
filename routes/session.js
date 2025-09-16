const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { getSessionMessages, clearSession } = require("../config/redis");

const router = express.Router();

router.post("/create", async (req, res) => {
  try {
    const sessionId = uuidv4();

    res.json({ sessionId });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/:sessionId/history", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await getSessionMessages(sessionId);

    res.json({ messages });
  } catch (error) {
    console.error("Error fetching session history:", error);
    res.status(500).json({ error: "Failed to fetch session history" });
  }
});

router.delete("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    await clearSession(sessionId);

    res.json({ success: true, message: "Session cleared successfully" });
  } catch (error) {
    console.error("Error clearing session:", error);
    res.status(500).json({ error: "Failed to clear session" });
  }
});
router.get("/:sessionId/stats", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await getSessionMessages(sessionId);

    const stats = {
      messageCount: messages.length,
      userMessages: messages.filter((m) => m.role === "user").length,
      assistantMessages: messages.filter((m) => m.role === "assistant").length,
      firstMessage: messages.length > 0 ? messages[0].timestamp : null,
      lastMessage:
        messages.length > 0 ? messages[messages.length - 1].timestamp : null,
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching session stats:", error);
    res.status(500).json({ error: "Failed to fetch session stats" });
  }
});

module.exports = router;
