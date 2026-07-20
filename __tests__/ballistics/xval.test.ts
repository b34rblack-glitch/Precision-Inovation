import { describe, expect, it } from 'vitest';
// eslint-disable-next-line import/no-extraneous-dependencies -- dev-only cross-validation
import Calculator, { Ammo, Atmo, DragModel, Shot, Table, UNew, Weapon } from 'js-ballistics';
import { solveTrajectory } from '@/lib/ballistics/solver';

// Cross-validation against js-ballistics v2 (JS port of py_ballisticcalc,
// an established open-source point-mass solver). Every load must agree to
// within 0.5 inch of drop and 3 fps at each 100 yd increment.

type Case = {
  name: string;
  mvFps: number;
  bc: number;
  model: 'G1' | 'G7';
  weightGr: number;
};

const CASES: Case[] = [
  { name: '.308 175 SMK G7 .243 @2600', mvFps: 2600, bc: 0.243, model: 'G7', weightGr: 175 },
  { name: '6.5 CM 140 G7 .326 @2710', mvFps: 2710, bc: 0.326, model: 'G7', weightGr: 140 },
  { name: '.223 55 FMJ G1 .269 @3240', mvFps: 3240, bc: 0.269, model: 'G1', weightGr: 55 },
];

function referenceTrajectory(c: Case) {
  const calc = new Calculator();
  const dm = new DragModel({
    bc: c.bc,
    dragTable: c.model === 'G7' ? Table.G7 : Table.G1,
    weight: UNew.Grain(c.weightGr),
    diameter: UNew.Inch(0.308),
    length: UNew.Inch(1.2),
  });
  const ammo = new Ammo({ dm, mv: UNew.FPS(c.mvFps) });
  const weapon = new Weapon({ sightHeight: UNew.Inch(1.5) });
  const atmo = new Atmo({
    pressure: UNew.InHg(29.9213),
    temperature: UNew.Fahrenheit(59),
    humidity: 0,
  });
  const shot = new Shot({ weapon, ammo, atmo });
  calc.setWeaponZero(shot, UNew.Yard(100));
  const result = calc.fire({
    shot,
    trajectoryRange: UNew.Yard(1000),
    trajectoryStep: UNew.Yard(100),
  });
  return result.trajectory
    .map((row: any) => ({
      distanceYd: Math.round(row.distance.In(UNew.Yard(1).units)),
      dropIn: row.targetDrop.In(UNew.Inch(1).units),
      velocityFps: row.velocity.In(UNew.FPS(1).units),
    }))
    .filter((r: { distanceYd: number }) => r.distanceYd >= 100);
}

describe('cross-validation vs js-ballistics', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const reference = referenceTrajectory(c);
      const mine = solveTrajectory({
        mvFps: c.mvFps,
        bc: c.bc,
        bcModel: c.model,
        zeroDistanceYd: 100,
        sightHeightIn: 1.5,
        atmo: { tempF: 59, pressureInHg: 29.9213, humidityPct: 0 },
        maxDistanceYd: 1000,
        stepYd: 100,
        bulletWeightGr: c.weightGr,
      });
      expect(reference.length).toBeGreaterThanOrEqual(10);
      for (const ref of reference) {
        const p = mine.find((m) => Math.abs(m.distanceYd - ref.distanceYd) < 2);
        expect(p, `no sample at ${ref.distanceYd} yd`).toBeDefined();
        expect(Math.abs(p!.dropIn - ref.dropIn), `drop @ ${ref.distanceYd} yd`).toBeLessThan(0.5);
        expect(
          Math.abs(p!.velocityFps - ref.velocityFps),
          `velocity @ ${ref.distanceYd} yd`,
        ).toBeLessThan(3);
      }
    });
  }
});
