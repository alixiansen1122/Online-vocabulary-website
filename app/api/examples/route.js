import { collectExamples } from "./providers.js";
import { MIN_EXAMPLES } from "../../../src/examples.js";

export async function GET(request) {
  const word = String(new URL(request.url).searchParams.get("word") || "").trim().toLowerCase();
  if (!word || word.length > 80 || !/^[a-zA-Z][a-zA-Z '\-/]*$/.test(word)) {
    return Response.json({ examples: [] }, { status: 400 });
  }
  const { examples, partial } = await collectExamples(word);
  return Response.json({ examples }, { headers: {
    "Cache-Control": partial || examples.length < MIN_EXAMPLES
      ? "public, max-age=300" : "public, max-age=86400, stale-while-revalidate=604800",
  } });
}
