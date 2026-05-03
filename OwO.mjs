import { readFile, writeFile } from "node:fs/promises";

const community = "repo";
const teamsWanted = ["Omniscye", "Empress_AI"];

const getJson = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "OwO" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
};

const existing = JSON.parse(await readFile("stats.json", "utf8"));
const packages = await getJson(`https://thunderstore.io/api/experimental/community/${community}/package/`);

const mods = packages
  .filter((pkg) => teamsWanted.includes(pkg.owner))
  .map((pkg) => ({
    id: `${pkg.owner}-${pkg.name}`,
    team: pkg.owner,
    displayTeam: pkg.owner === "Empress_AI" ? "Empress" : pkg.owner,
    name: pkg.name,
    displayName: (pkg.name || "").replaceAll("_", " "),
    downloads: Number(pkg.downloads || 0),
    ratings: Number(pkg.rating_score || pkg.rating || 0),
    description: pkg.description || "",
    updated: pkg.date_updated || pkg.latest?.date_created || new Date().toISOString(),
    url: `https://thunderstore.io/c/${community}/p/${pkg.owner}/${pkg.name}/`,
    categories: (pkg.categories || []).map((cat) => typeof cat === "string" ? cat : cat.name).filter(Boolean)
  }))
  .sort((a, b) => b.downloads - a.downloads);

const teams = {};
for (const team of teamsWanted) {
  const teamMods = mods.filter((mod) => mod.team === team);
  teams[team] = {
    displayName: team === "Empress_AI" ? "Empress" : team,
    url: `https://thunderstore.io/c/${community}/p/${team}/`,
    mods: teamMods.length,
    downloads: teamMods.reduce((sum, mod) => sum + mod.downloads, 0)
  };
}

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
console.log(`OwO ${stats.thunderstore.totalMods} ${stats.thunderstore.totalDownloads}`);
