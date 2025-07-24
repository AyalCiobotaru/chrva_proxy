import fetch from "node-fetch";

const CLIENT_ID = process.env.SE_CLIENT_ID;
const CLIENT_SECRET = process.env.SE_CLIENT_SECRET;
const GOOGLE_SCRIPT_URL = process.env.GS_SCRIPT_URL;

let cachedToken = null;
let cachedExpiry = 0;

async function getAccessToken() {
  // Reuse token if it's still valid
  if (cachedToken && Date.now() < cachedExpiry) {
    return cachedToken;
  }

  // Request a new token from SportsEngine
  const resp = await fetch("https://user.sportsengine.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch SportsEngine token: ${resp.status}`);
  }

  const data = await resp.json();
  cachedToken = data.access_token;
  cachedExpiry = Date.now() + (data.expires_in * 1000) - 60000; // buffer 1 min
  return cachedToken;
}

async function validateSession() {
  const token = await getAccessToken();

  // Validate using SportsEngine /oauth/me
  const resp = await fetch("https://user.sportsengine.com/oauth/me", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!resp.ok) return false;

  const userData = await resp.json();

  // OPTIONAL: Restrict to users/orgs
  // if (!userData.organizations?.some(org => org.name === "Chesapeake Region Volleyball")) {
  //   return false;
  // }

  return true;
}

export default async function handler(req, res) {
  try {
    const isValid = await validateSession();
    if (!isValid) {
      return res.status(403).json({ error: "Forbidden: invalid SportsEngine session" });
    }

    const sheetResp = await fetch(GOOGLE_SCRIPT_URL);
    const json = await sheetResp.text();

    res.setHeader("Access-Control-Allow-Origin", "https://www.chrva.org");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(json);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
}
