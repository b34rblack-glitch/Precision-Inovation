import { it } from 'vitest';
import { solveTrajectory } from '@/lib/ballistics/solver';

it('dump baseline', () => {
  const pts = solveTrajectory({
    mvFps: 2600, bc: 0.243, bcModel: 'G7', zeroDistanceYd: 100, sightHeightIn: 1.5,
    atmo: { tempF: 59, pressureInHg: 29.9213, humidityPct: 0 },
    maxDistanceYd: 1000, stepYd: 100, bulletWeightGr: 175,
  });
  for (const p of pts) {
    if ([300, 600, 1000].includes(p.distanceYd)) {
      console.log(p.distanceYd, p.dropIn, p.windIn, p.velocityFps, p.tofS, p.dropMil);
    }
  }
});
