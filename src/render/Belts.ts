/**
 * Populations rather than individual bodies: the main asteroid belt with its
 * Kirkwood gaps, Jupiter's Trojan swarms, the Kuiper belt and a marker for the
 * inner edge of the Oort cloud.
 *
 * Each particle carries its own orbital elements and is propagated on the GPU,
 * so a hundred thousand of them cost nothing per frame.
 */
import * as THREE from 'three';
import { makeRandom } from './textures/noise';
import { AU_UNITS, ScaleSettings } from './frame';

const VERTEX_SHADER = `
  attribute float aSemiMajor;
  attribute float aEcc;
  attribute float aInc;
  attribute float aNode;
  attribute float aPeri;
  attribute float aM0;
  attribute float aSize;
  attribute vec3 aColor;

  uniform float uTime;        // days since J2000
  uniform float uExponent;    // distance compression
  uniform float uAuUnits;
  uniform float uPointScale;

  varying vec3 vColor;

  void main() {
    float n = 0.01720209895 / pow(aSemiMajor, 1.5);
    float M = aM0 + n * uTime;
    // Two Newton steps are plenty for the small eccentricities here.
    float E = M + aEcc * sin(M);
    E = E - (E - aEcc * sin(E) - M) / (1.0 - aEcc * cos(E));
    E = E - (E - aEcc * sin(E) - M) / (1.0 - aEcc * cos(E));

    float cosE = cos(E);
    float sinE = sin(E);
    float r = aSemiMajor * (1.0 - aEcc * cosE);
    float nu = atan(sqrt(1.0 - aEcc * aEcc) * sinE, cosE - aEcc);

    float u = nu + aPeri;
    float cu = cos(u);
    float su = sin(u);
    float cn = cos(aNode);
    float sn = sin(aNode);
    float ci = cos(aInc);
    float si = sin(aInc);

    vec3 ecl = vec3(
      r * (cn * cu - sn * su * ci),
      r * (sn * cu + cn * su * ci),
      r * su * si
    );

    float scaled = pow(r, uExponent) / r;
    ecl *= scaled * uAuUnits;

    // Ecliptic (z north) -> scene (y up).
    vec3 scenePos = vec3(ecl.x, ecl.z, -ecl.y);

    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(scenePos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uPointScale / max(1.0, -mv.z) * 40000.0, 0.6, 4.0);
  }
`;

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float a = smoothstep(0.5, 0.1, length(d));
    if (a < 0.05) discard;
    gl_FragColor = vec4(vColor, a * 0.85);
  }
`;

interface ParticleSpec {
  count: number;
  /** returns [a, e, i, node, peri, M0] for particle index */
  sample: (rand: () => number, index: number) => [number, number, number, number, number, number];
  color: [number, number, number];
  colorJitter: number;
  size: [number, number];
  seed: number;
}

/** Kirkwood gaps: resonances with Jupiter that the belt has been swept clean of. */
const KIRKWOOD_GAPS: Array<[number, number]> = [
  [2.5, 0.03], [2.82, 0.02], [2.95, 0.02], [3.27, 0.04], [2.065, 0.015],
];

function inKirkwoodGap(a: number): boolean {
  return KIRKWOOD_GAPS.some(([centre, halfWidth]) => Math.abs(a - centre) < halfWidth);
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** Jupiter's mean longitude at J2000, which anchors the Trojan swarms. */
const JUPITER_L0 = 34.396 * DEG;

const POPULATIONS: Record<string, ParticleSpec> = {
  asteroids: {
    count: 14000,
    seed: 1301,
    color: [0.72, 0.66, 0.56],
    colorJitter: 0.18,
    size: [0.6, 1.6],
    sample: (rand) => {
      let a = 0;
      // Rejection sampling carves the Kirkwood gaps out of the distribution.
      for (let attempt = 0; attempt < 12; attempt++) {
        a = 2.06 + rand() * 1.24;
        if (!inKirkwoodGap(a)) break;
      }
      const e = Math.pow(rand(), 1.7) * 0.28;
      const i = Math.pow(rand(), 1.9) * 22 * DEG;
      return [a, e, i, rand() * TAU, rand() * TAU, rand() * TAU];
    },
  },
  trojans: {
    count: 3000,
    seed: 5507,
    color: [0.62, 0.55, 0.48],
    colorJitter: 0.14,
    size: [0.7, 1.7],
    sample: (rand, index) => {
      const leading = index % 2 === 0;
      const a = 5.2 + (rand() - 0.5) * 0.28;
      const e = Math.pow(rand(), 1.6) * 0.14;
      const i = Math.pow(rand(), 1.5) * 26 * DEG;
      // Libration around L4 / L5, 60 degrees ahead of and behind Jupiter.
      const spread = (rand() - 0.5) * 46 * DEG;
      const lagrange = leading ? 60 * DEG : -60 * DEG;
      return [a, e, i, 0, 0, JUPITER_L0 + lagrange + spread];
    },
  },
  kuiper: {
    count: 16000,
    seed: 8821,
    color: [0.58, 0.66, 0.82],
    colorJitter: 0.16,
    size: [0.6, 1.5],
    sample: (rand) => {
      // Classical belt plus a plutino spike at the 3:2 resonance.
      const plutino = rand() < 0.18;
      const a = plutino ? 39.4 + (rand() - 0.5) * 0.9 : 40 + rand() * 8;
      const e = plutino ? 0.08 + rand() * 0.2 : Math.pow(rand(), 1.8) * 0.22;
      const i = Math.pow(rand(), 1.8) * 32 * DEG;
      return [a, e, i, rand() * TAU, rand() * TAU, rand() * TAU];
    },
  },
  scattered: {
    count: 4000,
    seed: 9931,
    color: [0.5, 0.55, 0.7],
    colorJitter: 0.12,
    size: [0.5, 1.2],
    sample: (rand) => {
      const a = 50 + Math.pow(rand(), 1.5) * 200;
      const e = 0.25 + rand() * 0.5;
      const i = Math.pow(rand(), 1.4) * 40 * DEG;
      return [a, e, i, rand() * TAU, rand() * TAU, rand() * TAU];
    },
  },
};

export type BeltName = keyof typeof POPULATIONS;

export class Belts {
  readonly group = new THREE.Group();
  private readonly clouds = new Map<string, THREE.Points>();
  private readonly oort: THREE.Mesh;

  constructor() {
    this.group.name = 'belts';
    for (const [name, spec] of Object.entries(POPULATIONS)) {
      const points = this.buildCloud(spec);
      points.name = name;
      this.clouds.set(name, points);
      this.group.add(points);
    }

    this.oort = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.MeshBasicMaterial({
        color: 0x5a7aa8,
        transparent: true,
        opacity: 0.045,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.oort.name = 'oort';
    this.oort.visible = false;
    this.group.add(this.oort);
  }

  private buildCloud(spec: ParticleSpec): THREE.Points {
    const rand = makeRandom(spec.seed);
    const { count } = spec;
    const a = new Float32Array(count);
    const e = new Float32Array(count);
    const inc = new Float32Array(count);
    const node = new Float32Array(count);
    const peri = new Float32Array(count);
    const m0 = new Float32Array(count);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const [sa, se, si, sn, sp, sm] = spec.sample(rand, i);
      a[i] = sa;
      e[i] = se;
      inc[i] = si;
      node[i] = sn;
      peri[i] = sp;
      m0[i] = sm;
      size[i] = spec.size[0] + rand() * (spec.size[1] - spec.size[0]);
      const jitter = (rand() - 0.5) * spec.colorJitter;
      color[i * 3] = Math.max(0, spec.color[0] + jitter);
      color[i * 3 + 1] = Math.max(0, spec.color[1] + jitter);
      color[i * 3 + 2] = Math.max(0, spec.color[2] + jitter);
    }

    const geometry = new THREE.BufferGeometry();
    // A dummy position attribute keeps three.js happy; the shader ignores it.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSemiMajor', new THREE.BufferAttribute(a, 1));
    geometry.setAttribute('aEcc', new THREE.BufferAttribute(e, 1));
    geometry.setAttribute('aInc', new THREE.BufferAttribute(inc, 1));
    geometry.setAttribute('aNode', new THREE.BufferAttribute(node, 1));
    geometry.setAttribute('aPeri', new THREE.BufferAttribute(peri, 1));
    geometry.setAttribute('aM0', new THREE.BufferAttribute(m0, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uExponent: { value: 1 },
        uAuUnits: { value: AU_UNITS },
        uPointScale: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  update(daysSinceJ2000: number, scale: ScaleSettings, pointScale: number): void {
    for (const cloud of this.clouds.values()) {
      const uniforms = (cloud.material as THREE.ShaderMaterial).uniforms;
      uniforms.uTime.value = daysSinceJ2000;
      uniforms.uExponent.value = scale.distanceExponent;
      uniforms.uPointScale.value = pointScale;
    }
    // The Oort cloud's inner edge, about 2000 AU out.
    const radius = Math.pow(2000, scale.distanceExponent) * AU_UNITS;
    this.oort.scale.setScalar(radius);
  }

  setVisible(name: BeltName | 'oort', visible: boolean): void {
    if (name === 'oort') this.oort.visible = visible;
    else {
      const cloud = this.clouds.get(name);
      if (cloud) cloud.visible = visible;
    }
  }

  setAllVisible(visible: boolean): void {
    for (const cloud of this.clouds.values()) cloud.visible = visible;
  }
}
