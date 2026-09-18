// Shared harness: compiles a real source module through Next's swc and runs it in an
// isolated vm context, so tests exercise the shipped code rather than a copy of it.
// Not named *.test.cjs on purpose — `npm test` globs tests/*.test.cjs.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformSync } = require("next/dist/build/swc");

const ROOT = path.resolve(__dirname, "..");

// `env` becomes process.env inside the sandbox; `globals` adds anything else the
// module needs. URL/URLSearchParams are Node globals, not V8 globals, so they are
// absent from a fresh vm context unless passed in explicitly.
function compile(file, { aliases = {}, env = {}, globals = {} } = {}) {
  const filename = path.resolve(ROOT, file);
  const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2020", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const exports = {};
  vm.runInNewContext(
    code,
    {
      exports,
      process: { env },
      URL,
      URLSearchParams,
      ...globals,
      require: (name) => (name in aliases ? aliases[name] : require(name)),
    },
    { filename }
  );
  return exports;
}

module.exports = { ROOT, compile };
