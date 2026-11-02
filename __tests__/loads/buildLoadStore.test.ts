import { beforeEach, describe, expect, it } from 'vitest';
import { useBuildLoad } from '@/stores/buildLoadStore';

const store = () => useBuildLoad.getState();

describe('buildLoadStore', () => {
  beforeEach(() => store().reset());

  it('starts empty and seeds a fresh draft on start()', () => {
    expect(store().draft).toBeNull();
    store().start({ rifleId: 'r1', cartridge: '.308 Win' });
    expect(store().draft?.rifleId).toBe('r1');
    expect(store().draft?.cartridge).toBe('.308 Win');
    expect(store().stepIndex).toBe(0);
  });

  it('changing the charge clears the acknowledgement; other edits keep it', () => {
    store().start();
    store().patch({ chargeGr: '41.5' });
    store().patch({ chargeAcknowledged: true });
    expect(store().draft?.chargeAcknowledged).toBe(true);

    store().patch({ chargeMethod: 'Autotrickler' });
    expect(store().draft?.chargeAcknowledged).toBe(true);

    store().patch({ chargeGr: '41.5' }); // unchanged value: still acknowledged
    expect(store().draft?.chargeAcknowledged).toBe(true);

    store().patch({ chargeGr: '41.8' });
    expect(store().draft?.chargeAcknowledged).toBe(false);
  });

  it('a new run never inherits the previous acknowledgement', () => {
    store().start();
    store().patch({ chargeGr: '41.5', chargeAcknowledged: true });
    store().setStep(7);
    store().start();
    expect(store().draft?.chargeAcknowledged).toBe(false);
    expect(store().draft?.chargeGr).toBe('');
    expect(store().stepIndex).toBe(0);
  });

  it('patch is a no-op before start()', () => {
    store().patch({ primer: 'x' });
    expect(store().draft).toBeNull();
  });
});
