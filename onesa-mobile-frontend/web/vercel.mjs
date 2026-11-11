// Only the production custom domain should reach the commissioned Mobile gateway.
// Preview deployments and other aliases retain the explicit holding response.
export function accountRoutes({ VERCEL_ENV, MOBILE_ACCOUNT_GATEWAY_ORIGIN }) {
  if (VERCEL_ENV !== "production" || !MOBILE_ACCOUNT_GATEWAY_ORIGIN) return [];
  const gateway = new URL(MOBILE_ACCOUNT_GATEWAY_ORIGIN);
  if (gateway.protocol !== "https:" || gateway.port || gateway.username || gateway.password ||
      !gateway.hostname.endsWith(".onesa.eu") || gateway.hostname === "mobile.onesa.eu" ||
      ![gateway.origin, gateway.origin + "/"].includes(MOBILE_ACCOUNT_GATEWAY_ORIGIN)) {
    throw new Error("MOBILE_ACCOUNT_GATEWAY_ORIGIN must be the HTTPS origin of the dedicated Onesa Mobile backend gateway.");
  }

  const has = [{ type: "host", value: { eq: "mobile.onesa.eu" } }];
  return [
    { source: "/api", has, destination: gateway.origin + "/api/" },
    { source: "/api/:path(.*)", has, destination: gateway.origin + "/api/:path" },
  ];
}

export const config = {
  "framework": "vite",
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "cleanUrls": false,
  "functions": {
    "api/unavailable.mjs": {
      "maxDuration": 5
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
        }
      ]
    },
    {
      "source": "/((?!assets/).*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, max-age=0" },
        { "key": "CDN-Cache-Control", "value": "no-store" },
        { "key": "Vercel-CDN-Cache-Control", "value": "no-store" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(account|internal|preview|api)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" }
      ]
    },
    {
      "source": "/(account|internal|preview|api)/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" }
      ]
    }
  ],
  "rewrites": [
    ...accountRoutes(process.env),
    { "source": "/api", "destination": "/api/unavailable" },
    { "source": "/api/(.*)", "destination": "/api/unavailable" },
    { "source": "/account", "destination": "/index.html" },
    { "source": "/account/(.*)", "destination": "/index.html" },
    { "source": "/internal", "destination": "/index.html" },
    { "source": "/internal/(.*)", "destination": "/index.html" },
    { "source": "/preview", "destination": "/index.html" },
    { "source": "/preview/(.*)", "destination": "/index.html" }
  ]
};
