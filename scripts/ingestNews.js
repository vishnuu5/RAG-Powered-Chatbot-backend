require("dotenv").config();

const axios = require("axios");
const cheerio = require("cheerio");
const Parser = require("rss-parser");
const { generateEmbeddings } = require("../services/embeddings");
const { addDocument, initializeVectorDB } = require("../config/vectordb");
const { initializeRedis } = require("../config/redis");

const parser = new Parser();

const NEWS_SOURCES = [
  { name: "BBC", url: "http://feeds.bbci.co.uk/news/rss.xml", type: "rss" },
  { name: "CNN", url: "http://rss.cnn.com/rss/edition.rss", type: "rss" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", type: "rss" },
  {
    name: "NYTimes",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    type: "rss",
  },
];

const cleanText = (text) =>
  (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const fetchArticleContent = async (url) => {
  if (!url) return "";
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)" },
    });

    const $ = cheerio.load(response.data);
    $("script, style, nav, header, footer, aside, .advertisement").remove();

    const selectors = [
      "article p",
      ".article-body p",
      ".story-body p",
      ".content p",
      "main p",
      "p",
    ];
    let content = "";
    for (const s of selectors) {
      const p = $(s);
      if (p.length) {
        content = p
          .map((i, el) => $(el).text())
          .get()
          .join(" ");
        break;
      }
    }
    return cleanText(content).substring(0, 2000);
  } catch (err) {
    console.warn(` Error fetching article content from ${url}: ${err.message}`);
    return "";
  }
};

const ingestFromRSS = async (source) => {
  try {
    console.log(` Fetching from ${source.name}...`);
    const feed = await parser.parseURL(source.url);
    const articles = [];
    const maxArticles = 15;

    for (let i = 0; i < Math.min(feed.items.length, maxArticles); i++) {
      const item = feed.items[i];
      console.log(`   → Article ${i + 1}: ${item.title}`);

      const fullContent = await fetchArticleContent(item.link);
      const content =
        fullContent || cleanText(item.contentSnippet || item.content || "");

      if (content.length > 100) {
        articles.push({
          id: `${source.name.toLowerCase()}_${Date.now()}_${i}`,
          title: cleanText(item.title || ""),
          content,
          url: item.link || "",
          source: source.name,
          publishedDate:
            item.pubDate || item.isoDate || new Date().toISOString(),
          summary: cleanText(item.contentSnippet || "").substring(0, 300),
        });
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    return articles;
  } catch (err) {
    console.warn(`Error ingesting from ${source.name}: ${err.message}`);
    return [];
  }
};

const processAndStoreArticles = async (articles) => {
  console.log(`Processing ${articles.length} articles...`);
  const texts = articles.map(
    (a) => `${a.title}\n\n${a.content}\n\nSource: ${a.source}`
  );

  // generate embeddings in resilient manner
  const embeddings = await generateEmbeddings(texts, 3);

  // store only where embeddings exist
  let stored = 0;
  let skipped = 0;
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const embedding = embeddings[i];

    if (!embedding) {
      skipped++;
      console.warn(
        `   Skipping article (no embedding): ${article.title.substring(
          0,
          60
        )}...`
      );
      continue;
    }

    try {
      await addDocument(article.id, embedding, {
        title: article.title,
        content: article.content,
        url: article.url,
        source: article.source,
        publishedDate: article.publishedDate,
        summary: article.summary,
      });
      stored++;
      console.log(`   ✔ Stored: ${article.title.substring(0, 50)}...`);
    } catch (err) {
      console.error(`   Failed to store article ${article.id}:`, err.message);
    }
  }

  console.log(`Embedded & stored: ${stored}. Skipped: ${skipped}.`);
};

const main = async () => {
  try {
    console.log("Starting news ingestion...");
    try {
      await initializeRedis();
    } catch (err) {
      console.warn("Redis unavailable — continuing without cache");
    }

    await initializeVectorDB();

    const allArticles = [];
    for (const src of NEWS_SOURCES) {
      const arts = await ingestFromRSS(src);
      allArticles.push(...arts);
      console.log(`${src.name}: ${arts.length} articles`);
    }

    console.log(`Total collected: ${allArticles.length}`);
    if (allArticles.length === 0) {
      console.log("No articles to process");
      return;
    }

    await processAndStoreArticles(allArticles);
    console.log("Ingestion completed!");
    process.exit(0);
  } catch (err) {
    console.error("Error in main process:", err.message);
    process.exit(1);
  }
};

if (require.main === module) main();

module.exports = { main, ingestFromRSS, processAndStoreArticles };
