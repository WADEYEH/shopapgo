const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const workflows = path.join(root, ".github/workflows");
const read = (name) => fs.readFileSync(path.join(workflows, name), "utf8").replace(/\r\n/g, "\n");
const job = (source, name) => source.split(`\n  ${name}:\n`)[1]?.split(/\n  [a-z][\w-]*:\n/)[0];

test("all external Actions and reusable workflows are immutable; checkout does not retain a push credential", () => {
  for (const name of fs.readdirSync(workflows).filter((name) => name.endsWith(".yml"))) {
    const source = read(name);
    for (const match of source.matchAll(/^\s+(?:- )?uses: (\S+)(.*)$/gm)) {
      if (match[1].startsWith("./")) continue;
      assert.match(match[1], /@[a-f0-9]{40}$/, `${name}: ${match[1]}`);
      if (match[1].startsWith("actions/checkout@")) {
        assert.match(source.slice(match.index, match.index + match[0].length + 110), /persist-credentials: false/, name);
      }
    }
    assert.doesNotMatch(source, /^\s+pull_request_target:/m, name);
    assert.match(source, /^permissions:\n  contents: read/m, name);
  }
});

test("both deployments require main and an environment; deployment secrets are absent from job and build scopes", () => {
  const source = read("deploy.yml");
  assert.doesNotMatch(source, /secrets\.CLOUDFLARE_API_TOKEN|\n  credentials:/);
  for (const name of ["staging", "production"]) {
    const content = job(source, name);
    assert.ok(content, name);
    assert.match(content, /github\.ref == 'refs\/heads\/main'/);
    assert.match(content, new RegExp(`^    environment: ${name}$`, "m"));
    assert.doesNotMatch(content.split("    steps:\n")[0], /secrets\./, `${name}: job-wide secrets`);
    for (const step of content.split(/\n      - /).slice(1)) {
      if (!step.includes("secrets.")) continue;
      assert.match(step, /^name: (?:Apply database migrations|Deploy \(|Record the database restore point)/, `${name}: build must not receive deployment credentials`);
      assert.ok(step.includes(`secrets.${name.toUpperCase()}_CLOUDFLARE_API_TOKEN`));
    }
  }
});

test("automatic backup uses a dedicated main-only environment credential only in the export step", () => {
  const content = job(read("backup-database.yml"), "backup");
  assert.match(content, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(content, /environment: .*format\('backup-\{0\}'/);
  assert.doesNotMatch(content.split("    steps:\n")[0], /secrets\./);
  for (const step of content.split(/\n      - /).slice(1)) {
    if (step.includes("secrets.")) {
      assert.match(step, /^name: Export the database/);
      assert.ok(step.includes("secrets.D1_BACKUP_API_TOKEN"));
    }
  }
  assert.doesNotMatch(content, /secrets\.(?:CLOUDFLARE_API_TOKEN|PRODUCTION_CLOUDFLARE_API_TOKEN)/);
});

test("security scans run without credentials and pin binaries by checksum and containers by digest", () => {
  const source = read("security.yml");
  for (const name of ["secrets", "sast", "deps"]) assert.ok(job(source, name), name);
  assert.match(source, /GITLEAKS_SHA256: "[a-f0-9]{64}"/);
  assert.match(source, /OSV_SHA256: "[a-f0-9]{64}"/);
  assert.match(source, /semgrep\/semgrep:[^\s]+@sha256:[a-f0-9]{64}/);
  assert.equal((source.match(/sha256sum --check/g) ?? []).length, 2);
  assert.ok(source.includes("--redact"));
  assert.ok(source.includes("--baseline-commit"));
  assert.ok(source.includes('git merge-base "origin/$BASE_BRANCH" HEAD'), "stacked PRs include all fixes since main");
  assert.ok(source.includes("sys.exit(1 if found or report[\"scanner_errors\"] else 0)"));
  assert.doesNotMatch(source, /secrets:\s*inherit|\$\{\{\s*secrets\./);
});
