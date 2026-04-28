import fs from "node:fs/promises";
import path from "node:path";

const outputPath = path.join(import.meta.dirname, "stats.json");

const teamConfig = {
  Omniscye: {
    displayName: "Omniscye",
    url: "https://thunderstore.io/c/repo/p/Omniscye/"
  },
  Empress_AI: {
    displayName: "Empress",
    url: "https://thunderstore.io/c/repo/p/Empress_AI/"
  }
};

const nexusSnapshot = {
  profile: "Omniscye",
  url: "https://www.nexusmods.com/profile/Omniscye/mods",
  uniqueDownloads: 120237,
  mods: 198,
  profileViews: 35841,
  kudos: 142,
  verifiedAuthor: true,
  lastVerified: "2026-04-27"
};

function humanizeName(value) {
  return value.replace(/_/g, " ");
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WiredModArchive/1.0)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  return response.json();
}

async function getAllThunderstorePackages(team) {
  let url = `https://thunderstore.io/api/cyberstorm/listing/repo/${team}/`;
  const items = [];

  while (url) {
    const page = await getJson(url);
    items.push(...page.results);
    url = page.next;
  }

  return items;
}

function normalizePackage(team, item) {
  return {
    id: `${team}-${item.name}`,
    team,
    displayTeam: teamConfig[team].displayName,
    name: item.name,
    displayName: humanizeName(item.name),
    downloads: item.download_count,
    ratings: item.rating_count,
    description: item.description,
    updated: item.last_updated,
    url: `https://thunderstore.io/c/repo/p/${team}/${item.name}/`,
    categories: item.categories.map((category) => category.name)
  };
}

async function buildStats() {
  const allMods = [];
  const teams = {};

  for (const team of Object.keys(teamConfig)) {
    const packages = await getAllThunderstorePackages(team);
    const normalized = packages.map((item) => normalizePackage(team, item));
    const teamDownloads = normalized.reduce((sum, item) => sum + item.downloads, 0);

    teams[team] = {
      ...teamConfig[team],
      mods: normalized.length,
      downloads: teamDownloads
    };

    allMods.push(...normalized);
  }

  allMods.sort((a, b) => b.downloads - a.downloads);

  const output = {
    generatedAt: new Date().toISOString(),
    thunderstore: {
      totalDownloads: allMods.reduce((sum, item) => sum + item.downloads, 0),
      totalMods: allMods.length,
      teams
    },
    nexus: nexusSnapshot,
    mods: allMods
  };

  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return output;
}

buildStats()
  .then((output) => {
    console.log(`Wrote ${output.mods.length} mods to ${outputPath}`);
    console.log(`Thunderstore downloads: ${output.thunderstore.totalDownloads}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
