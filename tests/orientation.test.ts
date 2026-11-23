import { describe, expect, it } from 'vitest';
import { shouldAskToRotate, type OrientationSignals } from '../src/orientation';

const portrait: OrientationSignals = {
  coarsePointer: true,
  dismissed: false,
  textInputFocused: false,
  legacyAngle: 0,
  screenType: 'landscape-primary',
  viewportWidth: 390,
  viewportHeight: 280,
};

describe('orientation prompt', () => {
  it('trusts the iPhone angle when a keyboard or stale screen type makes the viewport appear wide', () => {
    expect(shouldAskToRotate(portrait)).toBe(false);
  });

  it('asks to rotate for either iPhone landscape angle', () => {
    expect(shouldAskToRotate({ ...portrait, legacyAngle: 90 })).toBe(true);
    expect(shouldAskToRotate({ ...portrait, legacyAngle: -90 })).toBe(true);
  });

  it('uses screen orientation when no legacy angle is available', () => {
    expect(shouldAskToRotate({ ...portrait, legacyAngle: undefined, screenType: 'portrait-primary' })).toBe(false);
    expect(shouldAskToRotate({ ...portrait, legacyAngle: undefined, screenType: 'landscape-primary' })).toBe(true);
  });

  it('allows desktop, focused text entry, and an explicit bypass', () => {
    expect(shouldAskToRotate({ ...portrait, coarsePointer: false, legacyAngle: 90 })).toBe(false);
    expect(shouldAskToRotate({ ...portrait, textInputFocused: true, legacyAngle: 90 })).toBe(false);
    expect(shouldAskToRotate({ ...portrait, dismissed: true, legacyAngle: 90 })).toBe(false);
  });
});
