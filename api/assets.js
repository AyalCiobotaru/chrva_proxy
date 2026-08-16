import { access, readFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_ORIGIN = "https://www.chrva.org";
const ASSETS_DIR = path.join(process.cwd(), "assets");
const IMAGE_TYPES = new Map([
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function assetPathForName(name) {
  const rawName = String(name || "");
  const filename = path.basename(rawName);
  const ext = path.extname(filename).toLowerCase();

  if (!filename || filename !== rawName || !IMAGE_TYPES.has(ext)) {
    return null;
  }

  return {
    filename,
    contentType: IMAGE_TYPES.get(ext),
    fullPath: path.join(ASSETS_DIR, filename)
  };
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET,OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const requestedName = Array.isArray(req.query.name) ? req.query.name[0] : req.query.name;
  const asset = assetPathForName(requestedName);

  if (!asset) {
    res.status(400).json({ error: "Provide a valid image filename in the name query parameter." });
    return;
  }

  try {
    await access(asset.fullPath);
    const bytes = await readFile(asset.fullPath);

    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800");
    res.setHeader("Content-Disposition", `inline; filename="${asset.filename.replace(/"/g, "")}"`);
    res.status(200).send(bytes);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      res.status(404).json({ error: "Image not found." });
      return;
    }

    console.error("Asset proxy error:", error);
    res.status(500).json({ error: "Unable to load image." });
  }
}