// Explicit deployment boundary: this function is not the Mobile backend.
// It never reads credentials or bodies, creates sessions, or forwards a request.
const body = JSON.stringify({
  error: {
    code: "BACKEND_NOT_CONNECTED",
    message:
      "Onesa Mobile account and staff services are not connected to this website yet. No request was saved and no payment or network action was performed.",
  },
});

export default {
  fetch(request) {
    return new Response(request.method === "HEAD" ? null : body, {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  },
};
