import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_RUNTIME_FILE_COUNT,
  PROJECT_ROOT,
  collectStaticRuntimeInventory,
  verifyStaticRuntimeTree,
} from "./static-runtime-inventory.mjs";
import { collectDockerBuildProvenance } from "./docker-build-context.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageTag = process.env.VETGEME_IMAGE_TAG || "local";
const imageRef = `vetgeme-web:${imageTag}`;
const composeService = process.env.VETGEME_COMPOSE_SERVICE || "web";
const webRoot = "/usr/share/nginx/html";

try {
  const evidence = await inspectDockerRuntime();
  console.log(JSON.stringify({ status: "passed", image: imageRef, ...evidence }, null, 2));
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}

async function inspectDockerRuntime() {
  assert.equal(projectRoot, PROJECT_ROOT, "inventory helper resolved a different project root");
  const expected = await collectStaticRuntimeInventory(projectRoot);
  assert.equal(expected.files.length, EXPECTED_RUNTIME_FILE_COUNT);

  const [image] = JSON.parse(docker(["image", "inspect", imageRef]));
  assert.ok(image, `${imageRef} was not found`);
  const provenance = await collectDockerBuildProvenance(projectRoot);
  const gitRevision = provenance.revision;
  const labels = image.Config?.Labels || {};
  assert.equal(
    labels["org.opencontainers.image.revision"],
    gitRevision,
    "OCI revision does not identify the checked-out commit",
  );
  assert.equal(
    labels["io.vetgeme.build-context-sha256"],
    provenance.contextSha256,
    "image does not identify the exact current Docker build inputs",
  );
  assert.equal(
    labels["io.vetgeme.build-dirty"],
    String(provenance.dirty),
    "image dirty-state provenance does not match the build inputs",
  );
  assertNonRoot(image.Config?.User, "image Config.User");
  assert.deepEqual(
    image.Config?.Healthcheck?.Test,
    ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"],
    "image healthcheck contract changed",
  );

  const [rollbackImage] = JSON.parse(docker([
    "image",
    "inspect",
    `vetgeme-web:${provenance.rollbackTag}`,
  ]));
  assert.equal(
    rollbackImage.Id,
    image.Id,
    "expected clean/dirty rollback tag does not identify the tested image",
  );

  const findOutput = docker([
    "run",
    "--rm",
    "--entrypoint",
    "/bin/sh",
    imageRef,
    "-ec",
    `cd ${webRoot} && find . -type f -print | sed 's#^\\./##' | sort`,
  ]);
  const imageFiles = findOutput.split("\n").map((file) => file.trim()).filter(Boolean);
  assert.deepEqual(imageFiles, expected.files, `${webRoot} does not contain the exact runtime inventory`);
  assert.ok(imageFiles.includes("content/registry.json"), "canonical content registry is absent from image");
  assert.ok(
    imageFiles.includes("content/packs/tier-01-v2/clinical/tier-01/manifest.json"),
    "canonical Tier 01 v2 manifest is absent from image",
  );
  assert.ok(
    imageFiles.includes("content/medical-packs/vetgeme-master-2026-07-14/medical/catalog/family-registry.json"),
    "registered medical family index is absent from image",
  );
  assert.ok(
    imageFiles.includes("content/system-packs/vetgeme-master-2026-07-14/capability-registry.json"),
    "registered capability index is absent from image",
  );
  assert.ok(
    !imageFiles.some((file) => file.startsWith("content/medical-packs/") && file.endsWith(".md")),
    "medical authoring Markdown leaked into the runtime image",
  );
  assert.ok(
    !imageFiles.some((file) => file.startsWith("content/system-packs/") && file.endsWith(".md")),
    "system authoring Markdown leaked into the runtime image",
  );
  for (const forbiddenPrefix of [
    "content/clinical/",
    "content/review-inputs/",
    "legacy/content/",
    "tier-01-v2/content/",
    "content/packs/tier-01-v2/future/",
  ]) {
    assert.ok(
      !imageFiles.some((file) => file.startsWith(forbiddenPrefix)),
      `${webRoot} contains non-shipping content under ${forbiddenPrefix}`,
    );
  }

  const nginxConfig = docker([
    "run",
    "--rm",
    "--entrypoint",
    "/bin/cat",
    imageRef,
    "/etc/nginx/conf.d/default.conf",
  ]);
  assert.match(nginxConfig, /(?:^|\n)\s*client_max_body_size\s+16k;/u, "nginx body limit changed");
  assert.match(nginxConfig, /(?:^|\n)\s*autoindex\s+off;/u, "nginx directory listing is enabled");

  const extractedRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-image-runtime-"));
  let extractionContainer = null;
  let verification;
  try {
    extractionContainer = docker(["create", imageRef]);
    docker(["cp", `${extractionContainer}:${webRoot}/.`, extractedRoot], { inherit: true });
    verification = await verifyStaticRuntimeTree(extractedRoot, expected, {
      rejectUnexpected: true,
      verifyAssetHashes: true,
      verifyFileHashes: true,
    });
  } finally {
    if (extractionContainer) docker(["rm", "-f", extractionContainer], { inherit: true, allowEmpty: true });
    await rm(extractedRoot, { recursive: true, force: true });
  }

  const containerIds = docker([
    "compose",
    "--project-directory",
    projectRoot,
    "-f",
    path.join(projectRoot, "compose.yaml"),
    "ps",
    "--status",
    "running",
    "-q",
    composeService,
  ]).split("\n").map((id) => id.trim()).filter(Boolean);
  assert.equal(containerIds.length, 1, `expected one running compose ${composeService} container`);
  const [container] = JSON.parse(docker(["container", "inspect", containerIds[0]]));
  assert.ok(container.State?.Running, "compose web container is not running");
  assert.equal(container.State?.Health?.Status, "healthy", "compose web container is not healthy");
  assert.equal(container.Image, image.Id, "compose is not running the inspected image");
  assertNonRoot(container.Config?.User, "running container Config.User");

  const hostConfig = container.HostConfig || {};
  assert.equal(hostConfig.ReadonlyRootfs, true, "compose root filesystem is writable");
  assert.equal(hostConfig.Privileged, false, "compose container is privileged");
  assert.ok(
    (hostConfig.CapDrop || []).map((capability) => capability.toUpperCase()).includes("ALL"),
    "compose container does not drop all capabilities",
  );
  assert.deepEqual(hostConfig.CapAdd || [], [], "compose container adds Linux capabilities");
  assert.ok(
    (hostConfig.SecurityOpt || []).some((option) => /^no-new-privileges(?::true)?$/u.test(option)),
    "compose container does not set no-new-privileges",
  );
  assert.ok(hostConfig.Tmpfs?.["/tmp"], "read-only runtime has no bounded /tmp tmpfs");
  const tmpfs = hostConfig.Tmpfs["/tmp"];
  for (const option of ["rw", "noexec", "nosuid", "uid=101", "gid=101", "mode=1777"]) {
    assert.ok(tmpfs.split(",").includes(option), `/tmp tmpfs is missing ${option}`);
  }
  assert.ok(
    tmpfs.split(",").some((option) => ["size=16m", "size=16777216"].includes(option.toLowerCase())),
    "/tmp tmpfs does not have the expected 16 MiB bound",
  );
  assert.equal(hostConfig.PidsLimit, 64, "compose pids_limit changed");
  assert.equal(hostConfig.Memory, 128 * 1024 * 1024, "compose memory limit changed");
  assert.equal(hostConfig.NanoCpus, 500_000_000, "compose CPU limit changed");
  assert.equal(hostConfig.RestartPolicy?.Name, "no", "compose restart policy changed");
  assert.ok(
    !(container.Mounts || []).some((mount) => (
      mount.Destination === webRoot || webRoot.startsWith(`${mount.Destination}/`)
    )),
    `${webRoot} is shadowed by a runtime mount`,
  );

  const publishedPortEntries = Object.entries(container.NetworkSettings?.Ports || {});
  assert.deepEqual(
    publishedPortEntries.map(([containerPort]) => containerPort).sort(),
    ["8080/tcp"],
    "container publishes an unexpected port",
  );
  const publishedPorts = container.NetworkSettings?.Ports?.["8080/tcp"] || [];
  assert.ok(publishedPorts.length > 0, "container port 8080 is not published");
  assert.equal(publishedPorts.length, 1, "container port 8080 has multiple host bindings");
  assert.ok(
    publishedPorts.every((binding) => binding.HostIp === "127.0.0.1"),
    "local compose port is exposed beyond loopback",
  );

  return {
    revision: gitRevision,
    buildContextSha256: provenance.contextSha256,
    buildDirty: provenance.dirty,
    rollbackTag: `vetgeme-web:${provenance.rollbackTag}`,
    imageId: image.Id,
    imageUser: image.Config.User,
    webRoot,
    inventory: {
      findFileCount: imageFiles.length,
      verifiedFileCount: verification.fileCount,
      verifiedFileHashes: verification.verifiedFileHashes,
      verifiedAssetHashes: verification.verifiedAssetHashes,
    },
    compose: {
      service: composeService,
      containerId: container.Id,
      user: container.Config.User,
      healthy: container.State.Health.Status,
      readOnly: hostConfig.ReadonlyRootfs,
      capDrop: hostConfig.CapDrop,
      securityOpt: hostConfig.SecurityOpt,
      tmpfs,
      pidsLimit: hostConfig.PidsLimit,
      memoryBytes: hostConfig.Memory,
      nanoCpus: hostConfig.NanoCpus,
      publishedPorts,
    },
  };
}

function run(command, args, { inherit = false, allowEmpty = false } = {}) {
  const output = execFileSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
    stdio: inherit ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
  const value = (output || "").trim();
  if (!allowEmpty && !inherit && value.length === 0) {
    throw new Error(`${command} ${args.join(" ")} returned no output`);
  }
  return value;
}

function docker(args, options) {
  return run("docker", args, options);
}

function assertNonRoot(value, label) {
  const user = String(value || "").trim();
  assert.ok(user, `${label} is empty`);
  assert.doesNotMatch(user, /^(?:0|root)(?::|$)/iu, `${label} is root (${user})`);
}
