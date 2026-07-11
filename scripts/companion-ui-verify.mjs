#!/usr/bin/env node
/**
 * Objective verification for companion graph layout (loop stop condition).
 * Exit 0 when overlaps === 0 on synthetic + stress fixtures.
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const GraphLayout = require(join(__dirname, "../apps/companion/ui/graph-layout.js"));

function fixture(name, nodes, edges, w, h) {
  const result = GraphLayout.layoutGraph(nodes, edges, w, h);
  const overlaps = GraphLayout.countOverlaps(result.pos, nodes, result.degree);
  return { name, overlaps, coverage: result.metrics?.coverage ?? 0, nodes: nodes.length };
}

const fixtures = [
  fixture(
    "epistemic-small",
    [
      { id: "w1", layer: "wisdom" },
      { id: "k1", layer: "knowledge" },
      { id: "k2", layer: "knowledge" },
      { id: "m1", layer: "memory" },
      { id: "m2", layer: "memory" },
      { id: "m3", layer: "memory" },
    ],
    [
      { from: "m1", to: "k1", type: "DERIVED_FROM" },
      { from: "m2", to: "k1", type: "DERIVED_FROM" },
      { from: "m3", to: "w1", type: "DERIVED_FROM" },
      { from: "k1", to: "w1", type: "DERIVED_FROM" },
      { from: "k2", to: "w1", type: "DERIVED_FROM" },
    ],
    480,
    520
  ),
  fixture(
    "dense-memory",
    Array.from({ length: 24 }, (_, i) => ({
      id: `m${i}`,
      layer: "memory",
    })).concat(
      { id: "k-hub", layer: "knowledge" },
      { id: "w-hub", layer: "wisdom" }
    ),
    Array.from({ length: 24 }, (_, i) => ({
      from: `m${i}`,
      to: i % 2 === 0 ? "k-hub" : "w-hub",
      type: "DERIVED_FROM",
    })).concat({ from: "k-hub", to: "w-hub", type: "DERIVED_FROM" }),
    480,
    620
  ),
  fixture(
    "popup-narrow",
    Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      layer: i < 2 ? "wisdom" : i < 5 ? "knowledge" : "memory",
    })),
    Array.from({ length: 11 }, (_, i) => ({
      from: `n${i + 1}`,
      to: `n${i}`,
      type: "DERIVED_FROM",
    })),
    360,
    400
  ),
];

let failed = 0;
for (const f of fixtures) {
  const ok = f.overlaps === 0;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark} ${f.name}: overlaps=${f.overlaps} nodes=${f.nodes} coverage=${f.coverage.toFixed(2)}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} fixture(s) failed — layout loop must continue.`);
  process.exit(1);
}
console.log("\nAll layout fixtures passed (overlaps === 0).");
