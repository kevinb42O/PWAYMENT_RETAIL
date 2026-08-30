import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const assetRoot = join(root, "assets");

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? collectFiles(path) : [path];
      }),
    )
  ).flat();
};

const files = await collectFiles(assetRoot);
const sizes = new Map(
  await Promise.all(files.map(async (file) => [file, (await stat(file)).size])),
);
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

const budgets = [
  { label: "App shell", match: /^App-.*\.js$/, max: 200 * 1024 },
  { label: "Insights", match: /^Insights-.*\.js$/, max: 150 * 1024 },
  { label: "Customers", match: /^Customers-.*\.js$/, max: 80 * 1024 },
  { label: "Audit log", match: /^AuditLog-.*\.js$/, max: 80 * 1024 },
  { label: "Z-report", match: /^ZReport-.*\.js$/, max: 60 * 1024 },
  // The owner financial workspace adds two dense responsive management views.
  // Keep a tight global Tailwind ceiling while allowing their shared utilities.
  { label: "Main CSS", match: /^index-.*\.css$/, max: 195 * 1024 },
];

const failures = [];
for (const budget of budgets) {
  const matches = [...sizes].filter(([file]) =>
    budget.match.test(relative(assetRoot, file)),
  );
  if (matches.length !== 1) {
    failures.push(
      `${budget.label}: expected exactly one matching artifact, found ${matches.length}`,
    );
    continue;
  }
  const [[file, bytes]] = matches;
  console.log(
    `${budget.label.padEnd(12)} ${kib(bytes).padStart(10)} / ${kib(budget.max)}`,
  );
  if (bytes > budget.max) {
    failures.push(
      `${relative(root, file)} is ${kib(bytes)}; budget is ${kib(budget.max)}`,
    );
  }
}

const javascript = [...sizes].filter(([file]) => file.endsWith(".js"));
const [largestJavaScript, largestJavaScriptBytes] = javascript.sort(
  (left, right) => right[1] - left[1],
)[0];
const largestJavaScriptBudget = 500 * 1024;
console.log(
  `Largest JS   ${kib(largestJavaScriptBytes).padStart(10)} / ${kib(largestJavaScriptBudget)}`,
);
if (largestJavaScriptBytes > largestJavaScriptBudget) {
  failures.push(
    `${relative(root, largestJavaScript)} is ${kib(largestJavaScriptBytes)}; largest-JS budget is ${kib(largestJavaScriptBudget)}`,
  );
}

const totalBytes = [...sizes.values()].reduce(
  (total, bytes) => total + bytes,
  0,
);
const totalBudget = 5.5 * 1024 * 1024;
console.log(
  `All assets   ${mib(totalBytes).padStart(10)} / ${mib(totalBudget)}`,
);
if (totalBytes > totalBudget) {
  failures.push(
    `dist/assets is ${mib(totalBytes)}; total budget is ${mib(totalBudget)}`,
  );
}

const sourceMaps = files.filter((file) => file.endsWith(".map"));
if (sourceMaps.length > 0)
  failures.push(
    `production bundle contains ${sourceMaps.length} source map(s)`,
  );

if (failures.length > 0) {
  console.error("\nBundle budget failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Bundle budgets passed.");
}
