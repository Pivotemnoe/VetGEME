import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectStaticRuntimeInventory } from "./static-runtime-inventory.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.VETGEME_PORT || "5174";
const baseUrl = new URL(
  process.env.DOCKER_BASE_URL
    || process.env.PLAYTEST_BASE_URL
    || process.env.VETGEME_BASE_URL
    || `http://127.0.0.1:${port}/`,
);
const runtimeInventory = await collectStaticRuntimeInventory(projectRoot);

const sourceFiles = Object.fromEntries([
  ["/index.html", "index.html"],
  ["/game.js", "game.js"],
  ...runtimeInventory.groups.canonicalContent.map((relativeFile) => [`/${relativeFile}`, relativeFile]),
]);

try {
  const evidence = await runHttpSmoke();
  console.log(JSON.stringify({ status: "passed", baseUrl: baseUrl.href, ...evidence }, null, 2));
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}

async function runHttpSmoke() {
  const sourceBuffers = Object.fromEntries(await Promise.all(
    Object.entries(sourceFiles).map(async ([urlPath, relativeFile]) => [
      urlPath,
      await readFile(path.join(projectRoot, ...relativeFile.split("/"))),
    ]),
  ));

  const parity = {};
  for (const [urlPath, sourceBuffer] of Object.entries(sourceBuffers)) {
    const served = await request(urlPath, { headers: { "accept-encoding": "identity" } });
    assert.equal(served.status, 200, `${urlPath} was not served`);
    assert.equal(sha256(served.body), sha256(sourceBuffer), `${urlPath} differs from the source tree`);
    parity[urlPath] = sha256(sourceBuffer);
  }

  const health = await request("/healthz", { headers: { "accept-encoding": "identity" } });
  assert.equal(health.status, 200);
  assert.equal(health.body.toString("utf8"), "ok\n");
  assert.equal(contentType(health), "text/plain");
  assertCache(health, "no-store", "/healthz");

  const healthHead = await request("/healthz", { method: "HEAD" });
  assert.equal(healthHead.status, 200);
  assert.equal(healthHead.body.length, 0, "HEAD /healthz returned a body");
  assertCache(healthHead, "no-store", "HEAD /healthz");

  const index = await request("/", { headers: { "accept-encoding": "identity" } });
  assert.equal(index.status, 200);
  assert.equal(sha256(index.body), parity["/index.html"], "/ and /index.html are not identical");
  assertCache(index, "no-cache", "/");
  assertSecurityHeaders(index, "/");

  const indexHead = await request("/index.html", {
    method: "HEAD",
    headers: { "accept-encoding": "identity" },
  });
  assert.equal(indexHead.status, 200);
  assert.equal(indexHead.body.length, 0, "HEAD /index.html returned a body");
  assert.equal(Number(indexHead.headers.get("content-length")), sourceBuffers["/index.html"].length);
  assertCache(indexHead, "no-cache", "HEAD /index.html");

  const modeHashes = {};
  for (const mode of ["current", "legacy-v1", "tier-01-v2"]) {
    const modeIndex = await request(`/?generatorMode=${mode}`, {
      headers: { "accept-encoding": "identity" },
    });
    assert.equal(modeIndex.status, 200, `${mode} query did not return index.html`);
    assert.equal(sha256(modeIndex.body), parity["/index.html"], `${mode} query changed index.html`);
    assertCache(modeIndex, "no-cache", `/?generatorMode=${mode}`);
    modeHashes[mode] = sha256(modeIndex.body);
  }

  const assets = [
    { path: "/styles.css", type: "text/css" },
    { path: "/game.js", type: "application/javascript" },
    { path: "/content/registry.json", type: "application/json" },
    {
      path: "/content/packs/tier-01-v2/clinical/tier-01/manifest.json",
      type: "application/json",
    },
    {
      path: "/content/medical-packs/vetgeme-master-2026-07-14/medical/catalog/family-registry.json",
      type: "application/json",
    },
    {
      path: "/content/system-packs/vetgeme-master-2026-07-14/capability-registry.json",
      type: "application/json",
    },
    {
      path: "/art/runtime-v2/assets/rooms/doctor-office.png",
      type: "image/png",
    },
  ];
  const cacheEvidence = {};
  for (const asset of assets) {
    const unversioned = await request(asset.path, { headers: { "accept-encoding": "identity" } });
    const versioned = await request(`${asset.path}?v=docker-smoke`, {
      headers: { "accept-encoding": "identity" },
    });
    assert.equal(unversioned.status, 200, `${asset.path} was not served`);
    assert.equal(versioned.status, 200, `${asset.path}?v= was not served`);
    assert.equal(contentType(unversioned), asset.type, `${asset.path} has the wrong content type`);
    assert.equal(contentType(versioned), asset.type, `${asset.path}?v= has the wrong content type`);
    assert.equal(sha256(versioned.body), sha256(unversioned.body), `${asset.path}?v= changed the body`);
    assertCache(unversioned, "no-cache", asset.path);
    assertCache(versioned, "immutable", `${asset.path}?v=docker-smoke`);
    cacheEvidence[asset.path] = {
      unversioned: unversioned.headers.get("cache-control"),
      versioned: versioned.headers.get("cache-control"),
    };
  }

  const versionedIndex = await request("/index.html?v=docker-smoke");
  assert.equal(versionedIndex.status, 200);
  assert.equal(sha256(versionedIndex.body), parity["/index.html"]);
  assertCache(versionedIndex, "no-cache", "/index.html?v=docker-smoke");

  const compressedGame = await request("/game.js?v=docker-smoke", {
    headers: { "accept-encoding": "gzip" },
  });
  assert.equal(compressedGame.status, 200);
  assert.equal(compressedGame.headers.get("content-encoding"), "gzip", "game.js was not gzip encoded");
  assert.match(compressedGame.headers.get("vary") || "", /accept-encoding/iu);
  assert.equal(sha256(compressedGame.body), parity["/game.js"], "gzip transport changed game.js");

  const disallowedMethods = {};
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await request("/healthz", { method });
    assert.equal(response.status, 405, `${method} was not rejected with 405`);
    assert.equal(response.headers.get("allow"), "GET, HEAD", `${method} response has no Allow contract`);
    assertSecurityHeaders(response, `${method} /healthz`);
    disallowedMethods[method] = response.status;
  }

  const oversizedPost = await request("/", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: Buffer.alloc(16 * 1024 + 1, 0x78),
  });
  assert.equal(oversizedPost.status, 405, "a request with an oversized body was not rejected");
  assert.equal(oversizedPost.headers.get("allow"), "GET, HEAD", "oversized request bypassed method policy");
  assertSecurityHeaders(oversizedPost, "oversized POST /");

  const tooLarge = await rawRequest("/", {
    method: "GET",
    body: Buffer.alloc(16 * 1024 + 1, 0x78),
  });
  assert.equal(tooLarge.status, 413, "client_max_body_size did not reject a body larger than 16 KiB");
  assertSecurityHeaders(tooLarge, "oversized GET /");

  const deniedPaths = [
    "/.env",
    "/.git/config",
    "/Dockerfile",
    "/compose.yaml",
    "/package.json",
    "/docker/nginx/default.conf",
    "/scripts/test-docker-http.mjs",
    "/systems/resource-lifecycle-v5.js",
    "/content/clinical/tier-01/manifest.json",
    "/content/review-inputs/registry.json",
    "/content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.39/source/MANIFEST.json",
    "/content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/provenance.json",
    "/content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source/MANIFEST.json",
    "/content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source/MANIFEST.json",
    "/content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.1/source/MANIFEST.json",
    "/content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2/provenance.json",
    "/content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2/source/MANIFEST.json",
    "/content/review-inputs/vetgeme-p8-medical-review-authoring-2026.07.16.1/source/MANIFEST.json",
    "/content/review-inputs/vetgeme-p8-medical-review-authoring-2026.07.16.2/provenance.json",
    "/content/review-inputs/vetgeme-p8-medical-review-authoring-2026.07.16.2/source/MANIFEST.json",
    "/content/not-runtime.json",
    "/content/packs/not-a-pack/manifest.json",
    "/content/packs/tier-01-v2/future/technical-infectious-course.json",
    "/content/packs/tier-01-v2/not-shipped.json",
    "/content/medical-packs/not-a-pack/PACKAGE_MANIFEST.json",
    "/content/medical-packs/vetgeme-master-2026-07-14/medical/README.md",
    "/content/medical-packs/vetgeme-master-2026-07-14/medical/families/01_ear/EAR_FAMILY.md",
    "/content/medical-packs/vetgeme-master-2026-07-14/medical/families/01_ear/not-shipped.json",
    "/content/system-packs/not-a-pack/capability-registry.json",
    "/content/system-packs/vetgeme-master-2026-07-14/README.md",
    "/content/system-packs/vetgeme-master-2026-07-14/not-shipped.json",
    "/handoff/vetgeme-master-package/systems/catalog/capability-registry.json",
    "/tier-01-v2/content/clinical/tier-01/manifest.json",
    "/tier-01-v2/scripts/validate-tier-01-content-v2.mjs",
    "/legacy/content/tier-01-v1-review/clinical/tier-01/manifest.json",
    "/art/ASSET_MANIFEST.json",
    "/handoff/vetgeme-master-package/README.md",
    "/definitely-not-a-vetgeme-route",
  ];
  const denied = {};
  for (const urlPath of deniedPaths) {
    const response = await request(urlPath);
    assert.equal(response.status, 404, `${urlPath} must be indistinguishable from a missing resource`);
    assertSecurityHeaders(response, urlPath);
    denied[urlPath] = response.status;
  }

  return {
    parity,
    health: { status: health.status, cacheControl: health.headers.get("cache-control") },
    modeHashes,
    cache: cacheEvidence,
    gzip: compressedGame.headers.get("content-encoding"),
    disallowedMethods,
    bodyLimitStatus: tooLarge.status,
    oversizedPostStatus: oversizedPost.status,
    denied,
  };
}

async function rawRequest(urlPath, { method = "GET", headers = {}, body = Buffer.alloc(0) } = {}) {
  const url = new URL(urlPath, baseUrl);
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const requestHandle = transport(url, {
      method,
      headers: {
        ...headers,
        "content-length": String(body.length),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: new Headers(Object.entries(response.headers).map(([name, value]) => [
          name,
          Array.isArray(value) ? value.join(", ") : String(value || ""),
        ])),
        body: Buffer.concat(chunks),
      }));
    });
    requestHandle.on("error", reject);
    requestHandle.end(body);
  });
}

async function request(urlPath, { method = "GET", headers = {}, body } = {}) {
  const url = new URL(urlPath, baseUrl);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    throw new Error(
      `${method} ${url.href} failed: ${error.cause?.message || error.message}`,
      { cause: error },
    );
  }
  return {
    status: response.status,
    headers: response.headers,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function contentType(response) {
  return (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
}

function assertCache(response, policy, label) {
  const value = (response.headers.get("cache-control") || "").toLowerCase();
  const directives = new Set(value.split(",").map((part) => part.trim()).filter(Boolean));
  if (policy === "immutable") {
    assert.ok(directives.has("public"), `${label}: versioned response is not public`);
    assert.ok(directives.has("immutable"), `${label}: versioned response is not immutable`);
    assert.ok(directives.has("max-age=31536000"), `${label}: versioned response has the wrong max-age`);
    assert.ok(!directives.has("no-cache") && !directives.has("no-store"), `${label}: cache rules conflict`);
    return;
  }
  assert.ok(directives.has(policy), `${label}: expected Cache-Control ${policy}, received ${value || "<empty>"}`);
  assert.ok(!directives.has("immutable"), `${label}: revalidated response must not be immutable`);
}

function assertSecurityHeaders(response, label) {
  const header = (name) => response.headers.get(name) || "";
  const csp = header("content-security-policy");
  assert.match(csp, /(?:^|;)\s*default-src 'none'(?:;|$)/u, `${label}: default CSP is not closed`);
  assert.match(csp, /(?:^|;)\s*script-src-elem 'self'(?:;|$)/u, `${label}: external scripts are not self-only`);
  assert.match(csp, /(?:^|;)\s*script-src-attr 'none'(?:;|$)/u, `${label}: script attributes are enabled`);
  assert.match(csp, /(?:^|;)\s*style-src 'self'(?:;|$)/u, `${label}: styles are not self-only`);
  assert.match(csp, /(?:^|;)\s*style-src-elem 'self'(?:;|$)/u, `${label}: style elements are not self-only`);
  assert.match(csp, /(?:^|;)\s*style-src-attr 'unsafe-inline'(?:;|$)/u, `${label}: runtime style attributes are disabled`);
  assert.doesNotMatch(csp, /(?:^|;)\s*style-src\s[^;]*'unsafe-inline'/u, `${label}: unsafe inline styles are enabled too broadly`);
  assert.match(csp, /(?:^|;)\s*object-src 'none'(?:;|$)/u, `${label}: objects are enabled`);
  assert.match(csp, /(?:^|;)\s*frame-ancestors 'none'(?:;|$)/u, `${label}: framing is enabled`);
  assert.match(csp, /(?:^|;)\s*connect-src 'self'(?:;|$)/u, `${label}: connections are not self-only`);
  assert.equal(header("x-content-type-options"), "nosniff", `${label}: MIME sniffing is enabled`);
  assert.equal(header("x-frame-options"), "DENY", `${label}: frame protection is missing`);
  assert.equal(header("referrer-policy"), "no-referrer", `${label}: referrers are exposed`);
  assert.equal(header("cross-origin-opener-policy"), "same-origin", `${label}: opener isolation is missing`);
  assert.equal(header("cross-origin-resource-policy"), "same-origin", `${label}: resource isolation is missing`);
  assert.match(header("permissions-policy"), /camera=\(\)/u, `${label}: camera permission is not disabled`);
  assert.match(header("permissions-policy"), /microphone=\(\)/u, `${label}: microphone permission is not disabled`);
  assert.equal(header("x-robots-tag"), "noindex, nofollow", `${label}: local runtime is indexable`);
  assert.doesNotMatch(header("server"), /\d/u, `${label}: server version is exposed`);
}
