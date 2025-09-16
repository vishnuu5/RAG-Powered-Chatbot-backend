const { QdrantClient } = require("@qdrant/js-client-rest");
const { v4: uuidv4 } = require("uuid");

let qdrantClient;
const COLLECTION_NAME = "news_articles";

const initializeVectorDB = async () => {
  try {
    qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL || "http://localhost:6333",
      apiKey: process.env.QDRANT_API_KEY,
    });

    try {
      await qdrantClient.getCollection(COLLECTION_NAME);
      console.log("Qdrant collection exists");
    } catch (error) {
      console.log("Creating Qdrant collection...");
      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768,
          distance: "Cosine",
        },
      });
      console.log("Qdrant collection created");
    }

    return qdrantClient;
  } catch (error) {
    console.error("Qdrant initialization failed:", error.message);
    throw error;
  }
};

const getVectorDBClient = () => {
  if (!qdrantClient) {
    throw new Error("Qdrant client not initialized");
  }
  return qdrantClient;
};

const searchSimilarDocuments = async (queryEmbedding, limit = 5) => {
  const client = getVectorDBClient();

  const searchResult = await client.search(COLLECTION_NAME, {
    vector: queryEmbedding,
    limit,
    with_payload: true,
    with_vector: false,
  });

  return searchResult.map((result) => ({
    content: result.payload.content,
    title: result.payload.title,
    url: result.payload.url,
    score: result.score,
    source: result.payload.source,
    publishedDate: result.payload.publishedDate,
    summary: result.payload.summary,
  }));
};

const getAnyDocuments = async (limit = 5) => {
  const client = getVectorDBClient();
  const res = await client.scroll(COLLECTION_NAME, {
    with_payload: true,
    with_vector: false,
    limit,
  });

  const points = Array.isArray(res.points) ? res.points : [];
  return points.map((p) => ({
    content: p.payload.content,
    title: p.payload.title,
    url: p.payload.url,
    score: null,
    source: p.payload.source,
    publishedDate: p.payload.publishedDate,
    summary: p.payload.summary,
  }));
};

const addDocument = async (id, embedding, payload) => {
  const client = getVectorDBClient();
  const safeId = /^[0-9]+$/.test(id) ? Number(id) : uuidv4();

  try {
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: [
        {
          id: safeId,
          vector: embedding,
          payload,
        },
      ],
    });
  } catch (err) {
    console.error(
      `Failed to upsert document ${id}:`,
      err.response?.data || err.message
    );
    throw err;
  }
};

module.exports = {
  initializeVectorDB,
  getVectorDBClient,
  searchSimilarDocuments,
  getAnyDocuments,
  addDocument,
  COLLECTION_NAME,
};
