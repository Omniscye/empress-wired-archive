import { readFile, writeFile } from "node:fs/promises";

const community = "repo";
const teamsWanted = ["Omniscye", "Empress_AI"];

const teamConfig = {
  Omniscye: {
    displayName: "Omniscye"
  },
  Empress_AI: {
    displayName: "Empress"
  }
};

const getJson = async (url) => {
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "OwO"
    }
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${url}`);
  }

  return res.json();
};

const getAllThunderstorePackages = async (team) => {
  let url = `https://thunderstore.io/api/cyberstorm/listing/${community}/${team}/`;
  const packages = [];

  while (url) {
    const page = await getJson(url);
    packages.push(...page.results);
    url = page.next;
  }

  return packages;
};

const getPackageMetrics = async (team, name) => {
  try {
    return await getJson(`https://thunderstore.io/api/v1/package-metrics/${team}/${name}/`);
  } catch {
    return null;
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const syncAppFallback = async (stats) => {
  const packed = await readFile("app.js", "utf8");
  const match = packed.match(/const _0='([^']+)'/);

  if (!match) {
    throw new Error("Could not find packed app.js payload");
  }

  let source = Buffer.from(match[1], "base64").toString("utf8");
  const fallbackSource = `const fallbackStats = ${JSON.stringify(stats, null, 2)};`;

  source = source.replace(/const fallbackStats = \{[\s\S]*?\n\};\n\nconst bootText = /, `${fallbackSource}\n\nconst bootText = `);
  source = source.replace(
    /fetch\((?:"\.\/stats\.json"|`\.\/stats\.json\?v=.*?`), \{ cache: "(?:no-store|reload)" \}\)/,
    'fetch(`./stats.json?v=${encodeURIComponent(fallbackStats.generatedAt)}`, { cache: "reload" })'
  );

  const encoded = Buffer.from(source, "utf8").toString("base64");
  await writeFile("app.js", `(()=>{const _0='${encoded}';(0,eval)(atob(_0));})();\n`);
};

const normalizePackage = async (team, item) => {
  const metrics = await getPackageMetrics(team, item.name);

  return {
    id: `${team}-${item.name}`,
    team,
    displayTeam: teamConfig[team].displayName,
    name: item.name,
    displayName: (item.name || "").replaceAll("_", " "),
    downloads: Number(metrics?.downloads ?? item.download_count ?? 0),
    ratings: Number(metrics?.rating_score ?? item.rating_count ?? 0),
    version: metrics?.latest_version ?? item.latest?.version_number ?? "",
    description: item.description || "",
    updated: item.last_updated || item.latest?.date_created || new Date().toISOString(),
    url: `https://thunderstore.io/c/${community}/p/${team}/${item.name}/`,
    categories: (item.categories || []).map((cat) => (typeof cat === "string" ? cat : cat.name)).filter(Boolean)
  };
};

const existing = JSON.parse(await readFile("stats.json", "utf8"));
const mods = [];
const teams = {};

for (const team of teamsWanted) {
  const packages = await getAllThunderstorePackages(team);
  const normalized = [];

  for (const item of packages) {
    normalized.push(await normalizePackage(team, item));
    await wait(120);
  }

  const downloads = normalized.reduce((sum, mod) => sum + mod.downloads, 0);

  teams[team] = {
    displayName: teamConfig[team].displayName,
    url: `https://thunderstore.io/c/${community}/p/${team}/`,
    mods: normalized.length,
    downloads
  };

  mods.push(...normalized);
}

mods.sort((a, b) => b.downloads - a.downloads);

const stats = {
  generatedAt: new Date().toISOString(),
  thunderstore: {
    totalDownloads: Object.values(teams).reduce((sum, team) => sum + team.downloads, 0),
    totalMods: mods.length,
    teams
  },
  nexus: existing.nexus,
  mods
};

await writeFile("stats.json", `${JSON.stringify(stats, null, 2)}\n`);
await syncAppFallback(stats);
console.log(`OwO ${stats.thunderstore.totalMods} ${stats.thunderstore.totalDownloads}`);
