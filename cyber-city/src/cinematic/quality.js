export const CINEMATIC_QUALITY = {
  performance: {
    label: 'Performance',
    description: 'For weaker hardware and for scrubbing the timeline.',
    renderScale: 0.72,

    prims: 2600,
    beams: 96,
    lights: 220,
    particles: 26000,
    trailSegments: 900,

    crowd: 14,
    shards: 90,
    memoryPanels: 40,
    islands: 46,
    shatterShards: 90,
    beamCount: 6,
    speedStreaks: 40,
    stationSparks: 60,

    motionSamples: 6,
    dofSamples: 8,
    radialSamples: 6,
    volumetricSteps: 8,
    volumetricLights: 6,
    ssaoSamples: 8,
    ssrSteps: 16,
    bloomMips: 6,
    maxLights: 220,
    ssao: true,
    ssr: true,
  },
  high: {
    label: 'High',
    description: 'The intended look at a comfortable frame rate.',
    renderScale: 1.0,
    prims: 4200,
    beams: 160,
    lights: 420,
    particles: 48000,
    trailSegments: 1600,
    crowd: 22,
    shards: 170,
    memoryPanels: 72,
    islands: 90,
    shatterShards: 170,
    beamCount: 9,
    speedStreaks: 80,
    stationSparks: 120,
    motionSamples: 10,
    dofSamples: 14,
    radialSamples: 10,
    volumetricSteps: 14,
    volumetricLights: 9,
    ssaoSamples: 14,
    ssrSteps: 32,
    bloomMips: 7,
    maxLights: 420,
    ssao: true,
    ssr: true,
  },
  ultra: {
    label: 'Ultra',
    description: 'Everything on. Expect a strong GPU.',
    renderScale: 1.0,
    prims: 6400,
    beams: 240,
    lights: 700,
    particles: 90000,
    trailSegments: 2600,
    crowd: 30,
    shards: 260,
    memoryPanels: 96,
    islands: 130,
    shatterShards: 240,
    beamCount: 12,
    speedStreaks: 120,
    stationSparks: 180,
    motionSamples: 16,
    dofSamples: 22,
    radialSamples: 14,
    volumetricSteps: 20,
    volumetricLights: 12,
    ssaoSamples: 20,
    ssrSteps: 44,
    bloomMips: 7,
    maxLights: 700,
    ssao: true,
    ssr: true,
  },
  film: {
    label: 'Film',
    description: 'For rendering out. Not meant to hold real time.',
    renderScale: 1.0,
    prims: 9000,
    beams: 320,
    lights: 1100,
    particles: 140000,
    trailSegments: 3600,
    crowd: 40,
    shards: 340,
    memoryPanels: 120,
    islands: 180,
    shatterShards: 320,
    beamCount: 14,
    speedStreaks: 170,
    stationSparks: 240,
    motionSamples: 22,
    dofSamples: 30,
    radialSamples: 18,
    volumetricSteps: 20,
    volumetricLights: 12,
    ssaoSamples: 24,
    ssrSteps: 52,
    bloomMips: 8,
    maxLights: 1100,
    ssao: true,
    ssr: true,
  },
};

export const QUALITY_ORDER = ['performance', 'high', 'ultra', 'film'];

export function resolveQuality(name) {
  return CINEMATIC_QUALITY[name] || CINEMATIC_QUALITY.high;
}

export function frameBudget(name) {
  const q = resolveQuality(name);
  const ceiling = CINEMATIC_QUALITY[name === 'performance' ? 'high' : 'film'];
  return {
    prims: Math.max(q.prims, ceiling.prims),
    beams: Math.max(q.beams, ceiling.beams),
    lights: Math.max(q.lights, ceiling.lights),
    particles: Math.max(q.particles, ceiling.particles),
    trailSegments: Math.max(q.trailSegments, ceiling.trailSegments),
  };
}

export function applyQualityToSettings(settings, name) {
  const q = resolveQuality(name);
  settings.maxLights = q.maxLights;
  settings.ssaoSamples = q.ssao ? q.ssaoSamples : 0;
  settings.ssrSteps = q.ssr ? q.ssrSteps : 0;
  settings.volumetricSteps = q.volumetricSteps;
  settings.volumetricLights = q.volumetricLights;
  settings.bloomMips = q.bloomMips;
  return q;
}

export function autoDetectQuality() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  if (mobile) return 'performance';
  if (cores >= 12 && memory >= 8) return 'ultra';
  if (cores <= 4 || memory <= 4) return 'performance';
  return 'high';
}
