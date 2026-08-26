import application from "../.output/server/index.mjs";

const STAGING_ENVIRONMENT = "staging";
const ROBOTS_HEADER = "noindex, nofollow, noarchive";

function isStaging(env) {
  return env?.SMART_FINANCE_ENVIRONMENT === STAGING_ENVIRONMENT;
}

function withStagingRobotsHeader(response, env) {
  if (!isStaging(env)) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", ROBOTS_HEADER);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function stagingRobotsResponse(request, env) {
  if (!isStaging(env) || new URL(request.url).pathname !== "/robots.txt") {
    return undefined;
  }

  return new Response("User-agent: *\nDisallow: /\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "X-Robots-Tag": ROBOTS_HEADER,
    },
  });
}

export default {
  async fetch(request, env, context) {
    const robots = stagingRobotsResponse(request, env);
    if (robots) return robots;

    const response = await application.fetch(request, env, context);
    return withStagingRobotsHeader(response, env);
  },
};
