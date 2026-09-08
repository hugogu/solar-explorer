import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../src/render/CameraRig';

/**
 * Projecting a world position must agree with where the renderer will draw it.
 * three.js refreshes matrixWorldInverse inside render(), so a rig that moves the
 * camera without publishing the new inverse leaves every projection a frame
 * behind - which looked like labels jittering away from their bodies on drag.
 */
function projectedX(rig: CameraRig, point: THREE.Vector3): number {
  return point.clone().project(rig.camera).x;
}

function trueProjectedX(rig: CameraRig, point: THREE.Vector3): number {
  const camera = rig.camera.clone();
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  return point.clone().project(camera).x;
}

describe('camera rig', () => {
  it('projects against the current pose while the view is being dragged', () => {
    const rig = new CameraRig(16 / 9);
    rig.distance = 500;
    rig.target.set(0, 0, 0);
    rig.snap();
    rig.update(1 / 60);

    const point = new THREE.Vector3(120, 0, 0);
    for (let frame = 0; frame < 20; frame++) {
      // A drag that speeds up and then reverses, as a real one does.
      rig.rotate(frame < 10 ? 0.03 : -0.05, 0);
      rig.update(1 / 60);
      expect(projectedX(rig, point), `frame ${frame}`).toBeCloseTo(trueProjectedX(rig, point), 9);
    }
  });

  it('does the same in the first-person surface view', () => {
    const rig = new CameraRig(1);
    rig.mode = 'surface';
    rig.setSurfaceFrame(
      new THREE.Vector3(0, 6.371, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(1, 0, 0),
    );
    rig.update(1 / 60);
    const point = new THREE.Vector3(0, 6.371, -100);
    for (let frame = 0; frame < 10; frame++) {
      rig.rotate(0.04, 0.01);
      rig.update(1 / 60);
      expect(projectedX(rig, point), `frame ${frame}`).toBeCloseTo(trueProjectedX(rig, point), 9);
    }
  });

  it('releases the location lock as soon as the viewer rotates', () => {
    const rig = new CameraRig(1);
    expect(rig.userRotated).toBe(false);
    rig.zoom(0.9);
    expect(rig.userRotated, 'zooming is not rotating').toBe(false);
    rig.rotate(0.01, 0);
    expect(rig.userRotated).toBe(true);
  });
});
