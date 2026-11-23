export interface OrientationSignals {
  coarsePointer: boolean;
  dismissed: boolean;
  textInputFocused: boolean;
  legacyAngle?: number;
  screenType?: string;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function shouldAskToRotate(signals: OrientationSignals): boolean {
  if (!signals.coarsePointer || signals.dismissed || signals.textInputFocused) return false;

  // iOS browsers can resize the viewport when the keyboard opens, and WebKit
  // may report screen.orientation late in browsers other than Safari.
  if (Number.isFinite(signals.legacyAngle)) {
    return Math.abs(signals.legacyAngle!) % 180 === 90;
  }
  if (signals.screenType?.startsWith('portrait')) return false;
  if (signals.screenType?.startsWith('landscape')) return true;
  if (signals.screenWidth && signals.screenHeight) {
    return signals.screenWidth > signals.screenHeight;
  }
  return signals.viewportWidth > signals.viewportHeight;
}
