/** Shared angle / interpolation helpers used across the ephemeris code. */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const ARCSEC = DEG / 3600;

export const sin = (deg: number) => Math.sin(deg * DEG);
export const cos = (deg: number) => Math.cos(deg * DEG);
export const tan = (deg: number) => Math.tan(deg * DEG);

/** Wrap to [0, 360). */
export function norm360(x: number): number {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

/** Wrap to (-180, 180]. */
export function norm180(x: number): number {
  const r = norm360(x);
  return r > 180 ? r - 360 : r;
}

/** Wrap to [0, 2pi). */
export function norm2pi(x: number): number {
  const r = x % (2 * Math.PI);
  return r < 0 ? r + 2 * Math.PI : r;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Angular separation of two spherical directions, all values in degrees. */
export function angularSeparation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const c = sin(dec1) * sin(dec2) + cos(dec1) * cos(dec2) * cos(ra1 - ra2);
  return Math.acos(clamp(c, -1, 1)) * RAD;
}

/** Evaluate a polynomial with ascending coefficients: c[0] + c[1]*t + c[2]*t^2 ... */
export function poly(coeffs: number[], t: number): number {
  let r = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) r = r * t + coeffs[i];
  return r;
}

/** Bisection root finder for a monotone-crossing bracket. */
export function bisect(f: (x: number) => number, lo: number, hi: number, tol: number, maxIter = 60): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  for (let i = 0; i < maxIter && b - a > tol; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fa * fm <= 0) b = m;
    else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

/** Golden-section minimisation of a unimodal function on [lo, hi]. */
export function minimize(f: (x: number) => number, lo: number, hi: number, tol: number): number {
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = f(c);
  let fd = f(d);
  while (b - a > tol) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}
