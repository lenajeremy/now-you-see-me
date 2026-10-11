import * as THREE from 'three';
import { FOV } from './config';
import { wrapAngle } from './util';

const MAX_PITCH = THREE.MathUtils.degToRad(85);
const KEY_TURN_SPEED = THREE.MathUtils.degToRad(90);
const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * Drag-to-look for the first-person pane. You grab the world and pull it, like a
 * 360° photo viewer. Scroll zooms; arrow keys turn; double-click faces home.
 */
export class LookControls {
  yaw: number;
  pitch = 0;
  fov: number = FOV.initial;

  private targetYaw: number;
  private targetPitch = 0;
  private targetFov: number = FOV.initial;
  private drag: { id: number; x: number; y: number } | null = null;
  private readonly held = new Set<string>();
  private readonly listeners = new AbortController();

  /**
   * @param el The element that receives the drags.
   * @param homeYaw Where the person faces at the start and on double-click.
   * @param verticalFov The camera's current vertical field of view, in degrees.
   */
  constructor(
    private readonly el: HTMLElement,
    private readonly homeYaw: number,
    private readonly verticalFov: () => number,
  ) {
    this.yaw = this.targetYaw = homeYaw;

    const signal = this.listeners.signal;
    el.addEventListener('pointerdown', this.onPointerDown, { signal });
    el.addEventListener('pointermove', this.onPointerMove, { signal });
    el.addEventListener('pointerup', this.onPointerUp, { signal });
    el.addEventListener('pointercancel', this.onPointerUp, { signal });
    el.addEventListener('wheel', this.onWheel, { passive: false, signal });
    el.addEventListener('dblclick', () => this.lookAt(this.homeYaw, 0), { signal });
    window.addEventListener('keydown', this.onKeyDown, { signal });
    window.addEventListener('keyup', (e) => this.held.delete(e.key), { signal });
    window.addEventListener('blur', () => this.held.clear(), { signal });
  }

  dispose(): void {
    this.listeners.abort();
  }

  /** Turns smoothly to face a direction, the short way round. */
  lookAt(yaw: number, pitch: number): void {
    this.targetYaw = this.yaw + wrapAngle(yaw - this.yaw);
    this.targetPitch = pitch;
  }

  update(dt: number): void {
    const turn = KEY_TURN_SPEED * dt;
    if (this.held.has('ArrowLeft')) this.targetYaw += turn;
    if (this.held.has('ArrowRight')) this.targetYaw -= turn;
    if (this.held.has('ArrowUp')) this.targetPitch = Math.min(this.targetPitch + turn, MAX_PITCH);
    if (this.held.has('ArrowDown')) this.targetPitch = Math.max(this.targetPitch - turn, -MAX_PITCH);

    this.yaw = THREE.MathUtils.damp(this.yaw, this.targetYaw, 12, dt);
    this.pitch = THREE.MathUtils.damp(this.pitch, this.targetPitch, 12, dt);
    this.fov = THREE.MathUtils.damp(this.fov, this.targetFov, 12, dt);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.drag) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.el.setPointerCapture(e.pointerId);
    this.el.classList.add('dragging');
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    // Turn by as much as the pointer moved across the view, so the spot you
    // grabbed stays under the pointer.
    const perPixel = THREE.MathUtils.degToRad(this.verticalFov()) / this.el.clientHeight;
    this.targetYaw += dx * perPixel;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * perPixel, -MAX_PITCH, MAX_PITCH);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.el.classList.remove('dragging');
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.targetFov = THREE.MathUtils.clamp(this.targetFov * Math.exp(e.deltaY * 0.0015), FOV.min, FOV.max);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!ARROW_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    this.held.add(e.key);
  };
}
