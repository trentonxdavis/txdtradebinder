// Proxies tcgcsv.com and adds the CORS header it doesn't send, so the site
// (a static page on GitHub Pages) can call it directly from the browser.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = "https://tcgcsv.com" + url.pathname + url.search;

    const upstream = await fetch(target, {
      headers: { "User-Agent": "txdtradebinder-proxy" },
    });
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};
