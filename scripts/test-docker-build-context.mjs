import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DOCKER_BUILD_INPUT_PATHS,
  assertSameDockerBuildProvenance,
  collectDockerBuildProvenance,
} from "./docker-build-context.mjs";

const fixture = await mkdtemp(path.join(os.tmpdir(), "vetgeme-docker-context-"));

try {
  await createFixture(fixture);
  git(fixture, ["init", "--quiet"]);
  git(fixture, ["config", "user.email", "docker-context-test@invalid"]);
  git(fixture, ["config", "user.name", "VetGEME Test"]);
  git(fixture, ["add", "."]);
  git(fixture, ["commit", "--quiet", "-m", "fixture"]);

  const clean = await collectDockerBuildProvenance(fixture);
  assert.equal(clean.dirty, false, "committed fixture was reported dirty");
  assert.equal(clean.rollbackTag, clean.revision.slice(0, 12));

  await mkdir(path.join(fixture, "art"), { recursive: true });
  await writeFile(path.join(fixture, "art", "user-owned.txt"), "outside build context\n");
  const userOwned = await collectDockerBuildProvenance(fixture);
  assert.equal(userOwned.dirty, false, "user-owned art outside runtime-v2 polluted provenance");
  assert.equal(userOwned.contextSha256, clean.contextSha256);

  await mkdir(path.join(fixture, "tier-01-v2", "content"), { recursive: true });
  await writeFile(
    path.join(fixture, "tier-01-v2", "content", "retired-copy.json"),
    "{\"retired\":true}\n",
  );
  const retiredTierCopy = await collectDockerBuildProvenance(fixture);
  assert.equal(
    retiredTierCopy.dirty,
    false,
    "retired tier-01-v2/content copy polluted canonical Docker provenance",
  );
  assert.equal(retiredTierCopy.contextSha256, clean.contextSha256);

  await mkdir(path.join(fixture, "content", "clinical"), { recursive: true });
  await writeFile(
    path.join(fixture, "content", "clinical", "retired-schema1.json"),
    "{\"schemaVersion\":1}\n",
  );
  const retiredSchemaOne = await collectDockerBuildProvenance(fixture);
  assert.equal(
    retiredSchemaOne.dirty,
    false,
    "retired content/clinical schema-1 copy polluted canonical Docker provenance",
  );
  assert.equal(retiredSchemaOne.contextSha256, clean.contextSha256);

  await mkdir(
    path.join(fixture, "content", "review-inputs", "medical-authoring", "source"),
    { recursive: true },
  );
  await writeFile(
    path.join(
      fixture,
      "content",
      "review-inputs",
      "medical-authoring",
      "source",
      "MANIFEST.json",
    ),
    "{\"reviewOnly\":true}\n",
  );
  const reviewOnlyInput = await collectDockerBuildProvenance(fixture);
  assert.equal(
    reviewOnlyInput.dirty,
    false,
    "review-only medical authoring input polluted production Docker provenance",
  );
  assert.equal(reviewOnlyInput.contextSha256, clean.contextSha256);

  await mkdir(
    path.join(fixture, "content", "review-inputs", "operational-authoring", "source"),
    { recursive: true },
  );
  await writeFile(
    path.join(
      fixture,
      "content",
      "review-inputs",
      "operational-authoring",
      "source",
      "MANIFEST.json",
    ),
    "{\"reviewOnly\":true}\n",
  );
  const operationalReviewOnlyInput = await collectDockerBuildProvenance(fixture);
  assert.equal(
    operationalReviewOnlyInput.dirty,
    false,
    "review-only operational authoring input polluted production Docker provenance",
  );
  assert.equal(operationalReviewOnlyInput.contextSha256, clean.contextSha256);

  await mkdir(
    path.join(fixture, "content", "review-inputs", "p5-authoring", "source"),
    { recursive: true },
  );
  await writeFile(
    path.join(
      fixture,
      "content",
      "review-inputs",
      "p5-authoring",
      "source",
      "MANIFEST.json",
    ),
    "{\"reviewOnly\":true}\n",
  );
  const p5ReviewOnlyInput = await collectDockerBuildProvenance(fixture);
  assert.equal(
    p5ReviewOnlyInput.dirty,
    false,
    "review-only P5 authoring input polluted production Docker provenance",
  );
  assert.equal(p5ReviewOnlyInput.contextSha256, clean.contextSha256);

  await writeFile(
    path.join(fixture, "content/system-packs/vetgeme-master-2026-07-14/not-registered.json"),
    "{\"notRegistered\":true}\n",
  );
  const unregisteredSystemFile = await collectDockerBuildProvenance(fixture);
  assert.equal(
    unregisteredSystemFile.dirty,
    false,
    "unregistered system-pack JSON polluted exact Docker provenance",
  );
  assert.equal(unregisteredSystemFile.contextSha256, clean.contextSha256);

  await writeFile(path.join(fixture, "scripts", "ignored.tmp"), "ignored but copied\n");
  const ignored = await collectDockerBuildProvenance(fixture);
  assert.equal(ignored.dirty, true, "ignored build input was not reported dirty");
  assert.notEqual(ignored.contextSha256, clean.contextSha256);
  assert.match(ignored.rollbackTag, /^dirty-[a-f0-9]{12}$/u);
  assert.throws(
    () => assertSameDockerBuildProvenance(clean, ignored),
    /changed during the build/u,
  );

  await rm(path.join(fixture, "scripts", "ignored.tmp"));
  await writeFile(path.join(fixture, "scripts", "new-runtime-test.js"), "new input\n");
  const untracked = await collectDockerBuildProvenance(fixture);
  assert.equal(untracked.dirty, true, "untracked build input was not reported dirty");
  assert.notEqual(untracked.contextSha256, clean.contextSha256);

  await rm(path.join(fixture, "scripts", "new-runtime-test.js"));
  const trackedFile = path.join(fixture, "game.js");
  await writeFile(trackedFile, "changed\n");
  const modified = await collectDockerBuildProvenance(fixture);
  assert.equal(modified.dirty, true, "modified build input was not reported dirty");
  assert.notEqual(modified.contextSha256, clean.contextSha256);

  await chmod(trackedFile, 0o755);
  const modeChanged = await collectDockerBuildProvenance(fixture);
  assert.notEqual(modeChanged.contextSha256, modified.contextSha256, "file mode is absent from context hash");

  console.log(JSON.stringify({
    status: "passed",
    cleanContextSha256: clean.contextSha256,
    ignoredInputDetected: true,
    untrackedInputDetected: true,
    modifiedInputDetected: true,
    modeIncluded: true,
    userArtExcluded: true,
    retiredTierContentExcluded: true,
    retiredSchemaOneExcluded: true,
    reviewOnlyAuthoringInputsExcluded: true,
    unregisteredSystemFileExcluded: true,
  }, null, 2));
} finally {
  await rm(fixture, { recursive: true, force: true });
}

async function createFixture(root) {
  const directoryPaths = new Set([
    "generator",
    "systems",
    "legacy",
    "visual",
    "content/packs/tier-01-v2",
    "content/medical-packs/vetgeme-master-2026-07-14",
    "tier-01-v2/scripts",
    "art/runtime-v2",
    "scripts",
  ]);
  await writeFile(path.join(root, ".gitignore"), "scripts/*.tmp\n");
  for (const relativePath of DOCKER_BUILD_INPUT_PATHS) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    if (directoryPaths.has(relativePath)) {
      await mkdir(absolutePath, { recursive: true });
      await writeFile(path.join(absolutePath, "fixture.txt"), `${relativePath}\n`);
    } else {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, `${relativePath}\n`);
    }
  }
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
