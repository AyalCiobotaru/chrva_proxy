# CHRVA Proxy Server

This Vercel serverless function acts as a secure **proxy** between the CHRVA website (hosted on SportsEngine SRM) and a private Google Sheet that stores form responses.  
It ensures only authenticated SportsEngine users can access the data, using **SportsEngine OAuth (Client Credentials flow)** for validation.

---

## Features
- Uses **SportsEngine API authentication** to validate access for each request.
- Fetches data from a private Google Sheet (via a Google Apps Script endpoint).
- Protects the JSON feed so only authorized users on `www.chrva.org` can access it.
- Caches SportsEngine tokens to reduce API calls and improve performance.

---

## Project Structure

```
chrva-proxy/
├── api/
│   └── chrva.js       # The Vercel serverless proxy function
├── package.json
└── README.md
```

---

## Environment Variables

Set these in the [Vercel dashboard → Project → Settings → Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables):

- **`SE_CLIENT_ID`** – SportsEngine App Client ID  
- **`SE_CLIENT_SECRET`** – SportsEngine App Client Secret  
- **`GS_SCRIPT_URL`** – The deployed Google Apps Script URL that returns the JSON sheet data

---

## Authentication Flow

1. The frontend (CHRVA SRM page) makes a request to `/api/chrva`.  
2. The proxy:
   - Requests or reuses a cached `access_token` from SportsEngine using the **Client Credentials flow**.
   - Uses that token to call `https://user.sportsengine.com/oauth/me` to validate the session.
   - (Optional) Checks that the user belongs to the **Chesapeake Region Volleyball** organization.
3. If validation passes, it fetches the Google Sheet JSON from `GS_SCRIPT_URL` and returns it to the frontend.
4. If validation fails, it returns `403 Forbidden`.

---

## Local Development

Install dependencies and run a local Vercel environment:

```bash
npm install
vercel dev
```

Add a `.env.local` file with your variables:

```bash
SE_CLIENT_ID=your-client-id
SE_CLIENT_SECRET=your-client-secret
GS_SCRIPT_URL=https://script.google.com/macros/s/your-script-id/exec
```

---

## Deployment

Deploy to Vercel (production):

```bash
vercel --prod
```

Make sure your domain (e.g., `proxy.chrva.org` or the default `vercel.app` URL) is added under **Project → Settings → Domains** in the Vercel dashboard.

---

## Frontend Integration

On the CHRVA SRM website, fetch the data with:

```js
fetch("https://proxy.chrva.org/api/chrva")
  .then(res => res.json())
  .then(data => {
    // Initialize your DataTable here
  });
```

---

## Optional Enhancements
- **Organization Restriction**: Uncomment the organization check in `chrva.js` to ensure only CHRVA org users can access.
- **Caching Sheet Data**: Add a cache layer (e.g., in-memory for 5 minutes) to reduce Google Apps Script requests.
