import { getAppUser } from "../../../app-auth.js";
import { ensureDatabase, getBooksBucket, getD1 } from "../../../../db/runtime.js";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "请先使用 ChatGPT 登录" }, { status: 401 });
  const { fingerprint } = await params;
  if (!/^[a-f0-9]{64}$/.test(fingerprint || "")) return new Response("Not found", { status: 404 });

  await ensureDatabase();
  const row = await getD1().prepare("SELECT image_key FROM memory_images WHERE fingerprint = ?")
    .bind(fingerprint).first();
  if (!row?.image_key) return new Response("Not found", { status: 404 });
  const object = await getBooksBucket().get(row.image_key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/webp",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
