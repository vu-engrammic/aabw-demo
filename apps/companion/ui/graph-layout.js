/** Solar-system layout — sun (company-wide) at center, silo/topic planets in orbit. */
const HIGH_LAYER = new Set(["knowledge", "wisdom"]);
const SKIP_EDGE = new Set(["CONTRADICTS", "SUPERSEDES"]);
const LABEL_GAP = 16;
const SUN_KEYS = new Set(["company", "org", "all"]);

function hashSeed(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h & 0xffff) / 0xffff;
}

function layoutEdgesFrom(dataEdges) {
  const edges = [];
  const seen = new Set();
  for (const raw of dataEdges || []) {
    const type = raw.type || "DERIVED_FROM";
    if (SKIP_EDGE.has(type)) continue;
    if (!raw.from || !raw.to || raw.from === raw.to) continue;
    const key = `${raw.from}:${raw.to}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ type, from: raw.from, to: raw.to });
  }
  return edges;
}

function nodeDegrees(nodes, edges) {
  const degree = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }
  return degree;
}

function nodeRadius(node, degree) {
  const d = degree.get(node.id) || 0;
  const base = node.layer === "wisdom" ? 5 : node.layer === "knowledge" ? 4 : 2.8;
  return base + Math.min(d * 0.4, 2.2);
}

function centerGraphBounds(pos, width, height) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (const p of pos.values()) {
    p.x = p.x - cx + width / 2;
    p.y = p.y - cy + height / 2;
  }
}

function buildAdjacency(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const e of edges) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }
  return adj;
}

function planetKey(node) {
  const team = String(node.team || node.planet || "Company").trim();
  if (!team || SUN_KEYS.has(team.toLowerCase())) return "Company";
  return team;
}

function connectedComponents(nodes, edges) {
  const adj = buildAdjacency(nodes, edges);
  const seen = new Set();
  const components = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const stack = [n.id];
    const comp = [];
    seen.add(n.id);
    while (stack.length) {
      const id = stack.pop();
      comp.push(id);
      for (const next of adj.get(id) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length);
}

function assignPlanetMap(nodes, edges) {
  const byTeam = new Map();
  for (const n of nodes) {
    const pk = planetKey(n);
    if (!byTeam.has(pk)) byTeam.set(pk, []);
    byTeam.get(pk).push(n.id);
  }

  const mapping = new Map();
  const sunCandidates = byTeam.get("Company");
  const hasRealSilos = [...byTeam.keys()].some((k) => k !== "Company");

  if (hasRealSilos) {
    for (const n of nodes) mapping.set(n.id, planetKey(n));
    return mapping;
  }

  const components = connectedComponents(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  components.forEach((comp, i) => {
    const name = i === 0 ? "Company" : topicLabel(comp, byId);
    for (const id of comp) mapping.set(id, name);
  });
  return mapping;
}

function topicLabel(componentIds, byId) {
  const members = componentIds.map((id) => byId.get(id)).filter(Boolean);
  const hub = [...members].sort((a, b) => {
    const score = (n) => (n.layer === "wisdom" ? 3 : n.layer === "knowledge" ? 2 : 1) + (n.title?.length || 0) * 0.01;
    return score(b) - score(a);
  })[0];
  const raw = hub?.title || hub?.summary || hub?.content || "Topic";
  const text = String(raw).trim().replace(/\s+/g, " ");
  if (text.length <= 22) return text;
  const words = text.split(" ").slice(0, 3).join(" ");
  return words.length > 22 ? `${words.slice(0, 21)}…` : words;
}

function layoutBody(nodes, cx, cy, bodyRadius, edges, degree, pos, planetName) {
  if (!nodes.length) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hub = [...nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))[0];
  const buckets = { wisdom: [], knowledge: [], memory: [] };
  for (const n of nodes) (buckets[n.layer] || buckets.memory).push(n);

  if (hub) {
    pos.set(hub.id, { x: cx, y: cy, planet: planetName });
  }

  const layerScale = { wisdom: 0.28, knowledge: 0.58, memory: 1.0 };
  for (const layer of ["wisdom", "knowledge", "memory"]) {
    const ring = bodyRadius * layerScale[layer];
    const members = buckets[layer].filter((n) => n.id !== hub?.id);
    members.forEach((n, i) => {
      const angle = (i / Math.max(members.length, 1)) * Math.PI * 2 + hashSeed(n.id) * 0.5;
      const jitter = 0.82 + hashSeed(`${n.id}:j`) * 0.28;
      pos.set(n.id, {
        x: cx + Math.cos(angle) * ring * jitter,
        y: cy + Math.sin(angle) * ring * jitter,
        planet: planetName,
      });
    });
  }

  for (const n of nodes) {
    if (pos.has(n.id)) continue;
    pos.set(n.id, { x: cx, y: cy, planet: planetName });
  }
}

function overlapRelax(pos, nodes, degree, passes = 40) {
  for (let pass = 0; pass < passes; pass += 1) {
    const cooling = 1 - pass / passes;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const pa = pos.get(nodes[i].id);
        const pb = pos.get(nodes[j].id);
        if (!pa || !pb) continue;
        if (pa.planet !== pb.planet) continue;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let dist = Math.hypot(dx, dy) || 0.5;
        const minDist = nodeRadius(nodes[i], degree) + nodeRadius(nodes[j], degree) + LABEL_GAP;
        if (dist >= minDist) continue;
        const push = ((minDist - dist) / dist) * 0.45 * cooling;
        dx *= push;
        dy *= push;
        pa.x -= dx;
        pa.y -= dy;
        pb.x += dx;
        pb.y += dy;
      }
    }
  }
}

function solarSystemLayout(nodes, edges, width, height) {
  const layoutEdges = layoutEdgesFrom(edges);
  const degree = nodeDegrees(nodes, layoutEdges);
  const planetMap = assignPlanetMap(nodes, layoutEdges);
  const byPlanet = new Map();

  for (const n of nodes) {
    const pk = planetMap.get(n.id) || "Company";
    if (!byPlanet.has(pk)) byPlanet.set(pk, []);
    byPlanet.get(pk).push(n);
  }

  const cx = width / 2;
  const cy = height / 2;
  const pos = new Map();
  const orbits = [];

  const sunName = byPlanet.has("Company") ? "Company" : [...byPlanet.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
  const sunNodes = byPlanet.get(sunName) || [];
  const sunRadius = 36 + Math.sqrt(sunNodes.length) * 10;
  layoutBody(sunNodes, cx, cy, sunRadius, layoutEdges, degree, pos, sunName);
  orbits.push({ cx, cy, r: sunRadius + 12, label: sunName, isSun: true });

  const planets = [...byPlanet.keys()].filter((k) => k !== sunName);
  planets.sort((a, b) => byPlanet.get(b).length - byPlanet.get(a).length);

  const orbitBase = Math.min(width, height) * 0.28;
  const orbitGap = 36;

  planets.forEach((name, i) => {
    const members = byPlanet.get(name);
    const angle = (i / Math.max(planets.length, 1)) * Math.PI * 2 - Math.PI / 2 + hashSeed(name) * 0.15;
    const orbitR = orbitBase + i * orbitGap + Math.sqrt(members.length) * 6;
    const px = cx + Math.cos(angle) * orbitR;
    const py = cy + Math.sin(angle) * orbitR;
    const bodyR = 18 + Math.sqrt(members.length) * 7;
    layoutBody(members, px, py, bodyR, layoutEdges, degree, pos, name);
    orbits.push({ cx: px, cy: py, r: bodyR + 10, label: name, isSun: false, orbitR });
  });

  overlapRelax(pos, nodes, degree, 45);
  centerGraphBounds(pos, width, height);

  const orbitsFinal = [];
  for (const [name, members] of byPlanet) {
    const pts = members.map((n) => pos.get(n.id)).filter(Boolean);
    if (!pts.length) continue;
    const ox = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const oy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const maxD = Math.max(...pts.map((p) => Math.hypot(p.x - ox, p.y - oy)), 12);
    orbitsFinal.push({
      cx: ox,
      cy: oy,
      r: maxD + 14,
      label: name,
      isSun: name === sunName,
    });
  }

  return {
    pos,
    layoutEdges,
    degree,
    meta: { orbits: orbitsFinal, sunName, planets },
    metrics: { overlaps: 0, attempt: 0, ringScale: 1, coverage: 0 },
  };
}

function layoutGraph(nodes, edges, width, height) {
  return solarSystemLayout(nodes, edges, width, height);
}

const GraphLayout = {
  HIGH_LAYER,
  layoutEdgesFrom,
  nodeDegrees,
  nodeRadius,
  planetKey,
  solarSystemLayout,
  layoutGraph,
  centerGraphBounds,
  fitGraphBounds: centerGraphBounds,
};

if (typeof window !== "undefined") window.GraphLayout = GraphLayout;
if (typeof module !== "undefined") module.exports = GraphLayout;
