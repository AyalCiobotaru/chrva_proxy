// api/chrva.js
import fetch from "node-fetch";

const GOOGLE_SCRIPT_URL = process.env.GS_SUB_URL;

export default async function handler(req, res) {
  // Set CORS headers for every response
  res.setHeader("Access-Control-Allow-Origin", "https://www.chrva.org");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    console.log("Env Script URL: " + GOOGLE_SCRIPT_URL)
    const response = await fetch(GOOGLE_SCRIPT_URL);
    const data = await response.text();
 
    res.status(200).send(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: error.message });
  }
}