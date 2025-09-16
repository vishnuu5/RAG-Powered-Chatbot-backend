const axios = require("axios");
const { getCachedEmbedding, cacheEmbedding } = require("../config/redis");

const callJina = async (texts, timeoutMs) => {
  const payload = {
    model: "jina-embeddings-v2-base-en",
    input: texts,
  };

  const opts = {
    headers: {
      Authorization: `Bearer ${process.env.JINA_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: Number(timeoutMs ?? process.env.JINA_TIMEOUT_MS ?? 30000),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  };

  return axios.post("https://api.jina.ai/v1/embeddings", payload, opts);
};

const generateBatchEmbeddingsWithRetries = async (
  texts,
  maxAttempts = 3,
  timeoutMs
) => {
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      console.log(
        `   → Jina call attempt ${attempt} (batch size ${texts.length})`
      );
      const resp = await callJina(texts, timeoutMs);

      if (!resp.data || !resp.data.data) {
        throw new Error("Invalid Jina response format");
      }

      return resp.data.data.map((d) => d.embedding);
    } catch (err) {
      lastErr = err;
      // If auth errors, don't retry
      if (
        err.response &&
        (err.response.status === 401 || err.response.status === 403)
      ) {
        console.error("Jina auth error (401/403). Check JINA_API_KEY in .env.");
        console.error("Jina response:", err.response.status, err.response.data);
        throw new Error("Jina authorization error");
      }

      console.warn(`Jina attempt ${attempt} failed: ${err.message}`);

      // If last attempt, break and return null
      if (attempt >= maxAttempts) break;
      const backoffMs =
        Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
      console.log(`   → retrying after ${backoffMs}ms...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  if (lastErr && lastErr.response) {
    console.error(
      "Final Jina response:",
      lastErr.response.status,
      lastErr.response.data
    );
  } else if (lastErr) {
    console.error("Final Jina error:", lastErr.message);
  } else {
    console.error("Unknown Jina failure.");
  }

  return null;
};

const generateEmbeddings = async (texts, batchSize = 3) => {
  const embeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(
      `⚡ Generating embeddings for batch ${
        Math.floor(i / batchSize) + 1
      }/${Math.ceil(texts.length / batchSize)} (${batch.length} items)`
    );

    const batchResult = await generateBatchEmbeddingsWithRetries(batch, 3);

    if (
      batchResult &&
      Array.isArray(batchResult) &&
      batchResult.length === batch.length
    ) {
      // push embeddings for this batch
      embeddings.push(...batchResult);
    } else if (batchResult === null) {
      // batch failed: push `null` placeholders so indices align with articles
      for (let k = 0; k < batch.length; k++) embeddings.push(null);
      console.warn(
        `⚠️ Batch failed after retries — ${batch.length} items will be skipped.`
      );
    } else {
      // unexpected shape
      for (let k = 0; k < batch.length; k++) embeddings.push(null);
      console.warn("Unexpected batch result shape — skipping items.");
    }

    // short polite delay to reduce risk of being rate-limited
    await new Promise((r) => setTimeout(r, 1200));
  }

  return embeddings;
};

const generateEmbedding = async (text) => {
  if (!text || typeof text !== "string") {
    throw new Error("Text must be a non-empty string");
  }

  if (!process.env.JINA_API_KEY) {
    return null;
  }

  try {
    const cached = await getCachedEmbedding(text);
    if (cached && Array.isArray(cached)) {
      return cached;
    }
  } catch (_) {}

  // Chat path: stricter timeout and fewer retries to avoid UI timeouts
  const chatTimeout = Number(process.env.JINA_CHAT_TIMEOUT_MS || 8000);
  const result = await generateBatchEmbeddingsWithRetries(
    [text],
    1,
    chatTimeout
  );
  if (!result || !Array.isArray(result) || result.length === 0) {
    return null;
  }

  const embedding = result[0];

  // Store in cache (best-effort)
  try {
    await cacheEmbedding(text, embedding);
  } catch (_) {}

  return embedding;
};

module.exports = {
  generateEmbeddings,
  generateEmbedding,
};
