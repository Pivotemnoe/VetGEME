import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSameDockerBuildProvenance,
  collectDockerBuildProvenance,
} from "./docker-build-context.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: options.env || process.env,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} завершился с кодом ${result.status}`);
  }
  return options.capture ? result.stdout.trim() : "";
}

const provenance = await collectDockerBuildProvenance(cwd);
const forwardedBuildArguments = parseBuildArguments(process.argv.slice(2));
const candidateTag = `build-${provenance.contextSha256.slice(0, 12)}`;
const dockerEnv = {
  ...process.env,
  VETGEME_IMAGE_TAG: candidateTag,
  VETGEME_VCS_REF: provenance.revision,
  VETGEME_BUILD_DATE: provenance.buildDate,
  VETGEME_BUILD_CONTEXT_SHA: provenance.contextSha256,
  VETGEME_BUILD_DIRTY: String(provenance.dirty),
};
delete dockerEnv.COMPOSE_FILE;
delete dockerEnv.COMPOSE_PROFILES;

const composeArgs = [
  "compose",
  "--project-directory",
  cwd,
  "-f",
  path.join(cwd, "compose.yaml"),
];

run(process.execPath, ["scripts/test-docker-prebuild.mjs"]);
run("docker", [...composeArgs, "config", "--quiet"], { env: dockerEnv });
run("docker", [
  ...composeArgs,
  "build",
  "--pull",
  "--build-arg",
  `VCS_REF=${provenance.revision}`,
  "--build-arg",
  `BUILD_DATE=${provenance.buildDate}`,
  "--build-arg",
  `BUILD_CONTEXT_SHA=${provenance.contextSha256}`,
  "--build-arg",
  `BUILD_DIRTY=${provenance.dirty}`,
  ...forwardedBuildArguments,
  "web",
], { env: dockerEnv });
const afterBuild = await collectDockerBuildProvenance(cwd);
assertSameDockerBuildProvenance(provenance, afterBuild);
const candidateImage = `vetgeme-web:${candidateTag}`;
run("docker", ["image", "tag", candidateImage, "vetgeme-web:local"]);
run("docker", ["image", "tag", candidateImage, `vetgeme-web:${provenance.rollbackTag}`]);

console.log(JSON.stringify({
  status: "passed",
  image: "vetgeme-web:local",
  rollbackTag: `vetgeme-web:${provenance.rollbackTag}`,
  revision: provenance.revision,
  buildDate: provenance.buildDate,
  buildContextSha256: provenance.contextSha256,
  dirty: provenance.dirty,
  buildInputFiles: provenance.inputFileCount,
  buildInputEntries: provenance.inputEntryCount,
}, null, 2));

function parseBuildArguments(args) {
  const parsed = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--no-cache") {
      parsed.push(argument);
      continue;
    }
    if (argument.startsWith("--progress=")) {
      assertProgress(argument.slice("--progress=".length));
      parsed.push(argument);
      continue;
    }
    if (argument === "--progress") {
      const value = args[index + 1];
      assertProgress(value);
      parsed.push(argument, value);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported Docker build argument: ${argument}`);
  }
  return parsed;
}

function assertProgress(value) {
  if (!["auto", "plain", "tty", "rawjson"].includes(value)) {
    throw new Error(`Unsupported Docker progress mode: ${value || "<empty>"}`);
  }
}
