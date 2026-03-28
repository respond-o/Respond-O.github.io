import OpenAI from "openai";

// Load your KB (we assume kb-embeddings.json exists)
import kb from "../kb-embeddings.json" assert { type: "json" };

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// cosine similarity helper
function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// find best articles
function findTopArticles(queryEmbedding, kb, topK = 3) {
  return kb
    .map((item) => ({
      ...item,
      score: cosineSimilarity(queryEmbedding, item.embedding || [])
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export default async function handler(req, res) {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    // 1. Convert user question into vector
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Find relevant KB articles
    const topArticles = findTopArticles(queryEmbedding, kb);

    // 3. Build context for AI
    const context = topArticles
      .map((a) => `Title: ${a.title}\nContent: ${a.content}`)
      .join("\n\n");

    // 4. Ask AI to answer using KB only
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Respond O, a helpful customer support AI.

Rules:
- Use ONLY the provided knowledge base
- If answer not found, say you will escalate to support
- Be concise and helpful
- Always suggest relevant help articles
`
        },
        {
          role: "user",
          content: `
User Question:
${message}

Knowledge Base:
${context}
`
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    // 5. Return response to frontend
    res.status(200).json({
      reply,
      articles: topArticles.map((a) => ({
        title: a.title,
        url: a.url
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Something went wrong"
    });
  }
}
