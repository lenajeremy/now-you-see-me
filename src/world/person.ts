import * as THREE from 'three';
import { EYE_HEIGHT, OUTSIDE_ONLY_LAYER } from './config';
import { wrapAngle } from './util';

/** How far the view cone reaches before it fades out. */
const CONE_LENGTH = 2.4;
const GAZE_COLOR = 0x9ad8ff;
/** How far the head can turn before the body is dragged along. */
const MAX_NECK_TWIST = THREE.MathUtils.degToRad(70);

/**
 * The person standing in the world: their eyes (the first-person camera), the
 * plain figure the outside camera sees, and a cone showing what's in their view.
 */
export class Person {
  /** The person's eyes. Looks down its local -Z, like every three.js camera. */
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
  /** The visible figure. Only the outside camera sees it. */
  readonly figure = new THREE.Group();

  private readonly head = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly cone = new ViewCone();
  private readonly gazeDot = new GazeDot();
  private readonly raycaster = new THREE.Raycaster();
  private readonly eye = new THREE.Vector3();
  private readonly gaze = new THREE.Vector3();
  private yaw: number;
  private bodyYaw: number;
  private coneLength = CONE_LENGTH;

  constructor(yaw: number) {
    this.yaw = this.bodyYaw = yaw;
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.add(this.cone.object);

    buildMannequin(this.body, this.head);
    this.head.position.y = EYE_HEIGHT;
    this.head.rotation.order = 'YXZ';
    this.figure.add(contactShadow());
    // The figure sits at the world origin, so the gaze dot can use world coordinates.
    this.figure.add(this.body, this.head, this.gazeDot.object);

    for (const root of [this.figure, this.cone.object]) {
      root.traverse((object) => object.layers.set(OUTSIDE_ONLY_LAYER));
    }
    this.raycaster.far = 30;
    this.setLook(yaw, 0);
  }

  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.camera.rotation.set(pitch, yaw, 0);
    // The head nods less than the eyes look, which reads more naturally.
    this.head.rotation.set(pitch * 0.7, yaw, 0);
  }

  /**
   * Sets the field of view for a pane of the given aspect ratio. `fov` is the
   * vertical angle on landscape panes and the horizontal angle on portrait panes,
   * so a narrow pane doesn't crop the sides away.
   */
  setView(fov: number, aspect: number): void {
    const vfov =
      aspect >= 1
        ? fov
        : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) / aspect));
    if (this.camera.fov === vfov && this.camera.aspect === aspect) return;
    this.camera.fov = vfov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.cone.setFrustum(vfov, aspect);
  }

  /** Turns the body after the head, and marks the spot the person is looking at on `surfaces`. */
  update(dt: number, surfaces: THREE.Object3D[]): void {
    let twist = wrapAngle(this.yaw - this.bodyYaw);
    if (Math.abs(twist) > MAX_NECK_TWIST) {
      this.bodyYaw += twist - Math.sign(twist) * MAX_NECK_TWIST;
      twist = Math.sign(twist) * MAX_NECK_TWIST;
    }
    this.bodyYaw += twist * (1 - Math.exp(-dt * 2.5));
    this.body.rotation.y = this.bodyYaw;

    this.camera.updateMatrixWorld();
    this.camera.getWorldPosition(this.eye);
    this.camera.getWorldDirection(this.gaze);
    this.raycaster.set(this.eye, this.gaze);
    const hit = this.raycaster.intersectObjects(surfaces, false)[0];
    this.gazeDot.update(dt, hit);
    // Don't let the cone poke through something closer than its usual length.
    this.coneLength = THREE.MathUtils.damp(this.coneLength, Math.min(hit?.distance ?? CONE_LENGTH, CONE_LENGTH), 10, dt);
    this.cone.object.scale.setScalar(this.coneLength);
  }
}

/**
 * A see-through pyramid from the eye, matching the first-person camera's view,
 * fading out toward its far end. Built 1 m long, then scaled.
 */
class ViewCone {
  readonly object = new THREE.Group();
  private readonly positions = new THREE.BufferAttribute(new Float32Array(5 * 3), 3);

  constructor() {
    const color = new THREE.Color(GAZE_COLOR);
    // RGBA per vertex: the apex, then the four far corners.
    const fade = (near: number, far: number) =>
      new THREE.Float32BufferAttribute(
        [near, far, far, far, far].flatMap((alpha) => [color.r, color.g, color.b, alpha]),
        4,
      );

    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute('position', this.positions);
    fillGeometry.setAttribute('color', fade(0.3, 0.02));
    fillGeometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
    const fill = new THREE.Mesh(
      fillGeometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', this.positions);
    edgeGeometry.setAttribute('color', fade(0.9, 0.1));
    edgeGeometry.setIndex([0, 1, 0, 2, 0, 3, 0, 4, 1, 2, 2, 3, 3, 4, 4, 1]);
    const edges = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    );

    // The shape changes every time the view does; skip culling rather than recomputing bounds.
    fill.frustumCulled = edges.frustumCulled = false;
    this.object.add(fill, edges);
    this.setFrustum(60, 1);
  }

  setFrustum(vfov: number, aspect: number): void {
    const y = Math.tan(THREE.MathUtils.degToRad(vfov) / 2);
    const x = y * aspect;
    (this.positions.array as Float32Array).set([0, 0, 0, -x, y, -1, x, y, -1, x, -y, -1, -x, -y, -1]);
    this.positions.needsUpdate = true;
  }
}

/** A small ring that sits wherever the centre of the person's view lands. */
class GazeDot {
  readonly object = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({
    color: GAZE_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly normal = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();

  constructor() {
    this.object.add(
      new THREE.Mesh(new THREE.RingGeometry(0.04, 0.058, 40), this.material),
      new THREE.Mesh(new THREE.CircleGeometry(0.014, 20), this.material),
    );
    this.object.visible = false;
  }

  update(dt: number, hit: THREE.Intersection | undefined): void {
    if (hit?.face) {
      this.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      this.object.position.copy(hit.point).addScaledVector(this.normal, 0.004);
      this.object.lookAt(this.aim.copy(this.object.position).add(this.normal));
    }
    this.material.opacity = THREE.MathUtils.damp(this.material.opacity, hit ? 0.95 : 0, 12, dt);
    this.object.visible = this.material.opacity > 0.01;
  }
}

/**
 * A soft dark pool on the ground under the figure. It grounds the figure, and
 * hides whatever the panorama has straight down (tripods, patched-over operators),
 * which the floor projection smears out around the feet.
 */
function contactShadow(): THREE.Mesh {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  return shadow;
}

/**
 * A plain artist's mannequin, about 1.75 m tall, facing -Z. The body parts go in
 * `body`; the head goes in `head`, whose origin is at the eyes.
 */
function buildMannequin(body: THREE.Group, head: THREE.Group): void {
  const clay = new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.55 });
  const joint = new THREE.MeshStandardMaterial({ color: 0xa8a196, roughness: 0.6 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.15, metalness: 0.4 });

  const part = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    [x, y, z]: [number, number, number],
    [sx, sy, sz]: [number, number, number] = [1, 1, 1],
    tilt = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.z = tilt;
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const leg = new THREE.CapsuleGeometry(0.068, 0.72, 8, 16);
  const arm = new THREE.CapsuleGeometry(0.046, 0.5, 8, 16);
  const shoulder = new THREE.SphereGeometry(0.06, 20, 14);

  part(body, new THREE.CapsuleGeometry(0.15, 0.3, 8, 24), clay, [0, 1.15, 0], [1.2, 1, 0.75]);
  part(body, new THREE.SphereGeometry(0.14, 24, 16), joint, [0, 0.88, 0], [1.15, 0.8, 0.8]);
  part(body, new THREE.CylinderGeometry(0.045, 0.05, 0.14, 16), joint, [0, 1.47, 0]);
  for (const side of [-1, 1]) {
    part(body, leg, clay, [side * 0.09, 0.47, 0]);
    part(body, arm, clay, [side * 0.235, 1.12, 0], [1, 1, 1], side * 0.07);
    part(body, shoulder, joint, [side * 0.22, 1.4, 0]);
  }

  const skullScale: [number, number, number] = [0.92, 1.12, 1];
  part(head, new THREE.SphereGeometry(0.105, 32, 24), clay, [0, 0.03, 0.01], skullScale);
  // A dark band across the eyes on the front (-Z) of the head, so you can tell where it faces.
  const band = new THREE.SphereGeometry(0.109, 32, 8, Math.PI * 1.5 - 0.95, 1.9, 1.45, 0.44);
  part(head, band, visor, [0, 0.03, 0.01], skullScale);
}
