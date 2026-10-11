import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OUTSIDE_ONLY_LAYER, STAGE_YAW } from './config';
import { World, type PanoramaOptions } from './world';
import { WorldScreen } from './screen';
import { Person } from './person';
import { LookControls } from './lookControls';
import { SplitView, type PaneRect, type ViewMode } from './splitView';
import { WorldAudio } from './audio';
import { disposeTree } from './util';

/** The page elements the world draws into and takes input from. */
export interface EngineElements {
  /** Holds everything; the world fills it. */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Transparent layers over the canvas that take the input for each view. */
  outsidePane: HTMLElement;
  firstPane: HTMLElement;
  divider: HTMLElement;
}

export interface EngineOptions {
  mode?: ViewMode;
  /** Whether the in-world screen starts out shown. */
  screenVisible?: boolean;
}

const MODE_KEYS: Record<string, ViewMode> = { '1': 'outside', '2': 'split', '3': 'first' };

/**
 * The 3D world around a 360° video: the person standing in it (first-person
 * camera), an outside view of their figure, the screen in front of them, and
 * the sound. One canvas is drawn once per visible view each frame.
 */
export class WorldEngine {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly world: World;
  readonly screen = new WorldScreen();
  readonly person = new Person(STAGE_YAW);
  readonly look: LookControls;
  readonly split: SplitView;
  readonly audio: WorldAudio;
  /** What clicking the in-world screen does right now, if anything (answering a call, say). */
  screenAction: (() => void) | null = null;

  private readonly outsideCamera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
  private readonly orbit: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly listeners = new AbortController();
  private lastTime = performance.now();

  constructor(
    private readonly el: EngineElements,
    options: EngineOptions = {},
  ) {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setScissorTest(true);
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(el.root);

    const scene = this.scene;
    scene.background = new THREE.Color(0x0a0b0e);
    // The stage holds what's placed relative to where the person faces.
    const stage = new THREE.Group();
    stage.rotation.y = STAGE_YAW;
    stage.add(this.screen.group);
    scene.add(stage, this.person.figure, this.person.camera);
    this.world = new World(scene, renderer);

    // Outside view: starts behind and to the left of the person.
    this.outsideCamera.layers.enable(OUTSIDE_ONLY_LAYER);
    const forward = new THREE.Vector3(-Math.sin(STAGE_YAW), 0, -Math.cos(STAGE_YAW));
    const left = new THREE.Vector3(-Math.cos(STAGE_YAW), 0, Math.sin(STAGE_YAW));
    this.outsideCamera.position.copy(forward).multiplyScalar(-5).addScaledVector(left, 4).setY(3.2);
    this.orbit = new OrbitControls(this.outsideCamera, el.outsidePane);
    this.orbit.target.copy(forward).multiplyScalar(2).setY(1.3);
    this.orbit.enableDamping = true;
    this.orbit.minDistance = 1.5;
    this.orbit.maxDistance = 30;
    this.orbit.maxPolarAngle = THREE.MathUtils.degToRad(88);
    this.orbit.update();

    this.look = new LookControls(el.firstPane, STAGE_YAW, () => this.person.camera.fov);
    this.split = new SplitView(el.root, el.outsidePane, el.firstPane, el.divider);
    this.split.setMode(options.mode ?? 'first');
    this.screen.setVisible(options.screenVisible ?? false);
    this.audio = new WorldAudio(this.person.camera, this.screen.speaker);

    this.listenForKeys();
    this.listenForScreenClicks();
    renderer.setAnimationLoop(this.frame);
  }

  /** Puts a 360° video around the person. The caller owns the video element. */
  showVideo(video: HTMLVideoElement, options?: PanoramaOptions): void {
    this.world.showVideo(video, options);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.listeners.abort();
    this.orbit.dispose();
    this.look.dispose();
    this.split.dispose();
    this.audio.dispose();
    this.screen.dispose();
    this.world.dispose();
    disposeTree(this.scene);
    this.renderer.dispose();
  }

  private resize(): void {
    this.renderer.setSize(this.el.root.clientWidth, this.el.root.clientHeight, false);
  }

  /** 1, 2, 3 pick the views; S shows or hides the screen. Ignored while typing. */
  private listenForKeys(): void {
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
        const mode = MODE_KEYS[e.key];
        if (mode) this.split.setMode(mode);
        if (e.key === 's' || e.key === 'S') this.screen.setVisible(!this.screen.visible);
      },
      { signal: this.listeners.signal },
    );
  }

  /** A click (not a drag) on the screen, in either view, runs the screen's action. */
  private listenForScreenClicks(): void {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const signal = this.listeners.signal;
    const panes: [HTMLElement, THREE.Camera][] = [
      [this.el.outsidePane, this.outsideCamera],
      [this.el.firstPane, this.person.camera],
    ];
    for (const [pane, camera] of panes) {
      const pointsAtScreen = (e: PointerEvent) => {
        const rect = pane.getBoundingClientRect();
        pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(this.screen.surfaces, false).length > 0;
      };
      let pressedAt: { x: number; y: number } | null = null;
      pane.addEventListener('pointerdown', (e) => (pressedAt = { x: e.clientX, y: e.clientY }), { signal });
      pane.addEventListener(
        'pointerup',
        (e) => {
          const moved = pressedAt ? Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) : Infinity;
          pressedAt = null;
          if (moved < 5 && this.screenAction && pointsAtScreen(e)) this.screenAction();
        },
        { signal },
      );
      pane.addEventListener(
        'pointermove',
        (e) => {
          if (e.buttons === 0) pane.classList.toggle('over-screen', !!this.screenAction && pointsAtScreen(e));
        },
        { signal },
      );
    }
  }

  private frame = (time: number): void => {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    const layout = this.split.update(dt);
    this.look.update(dt);
    this.person.setLook(this.look.yaw, this.look.pitch);
    if (layout.first) this.person.setView(this.look.fov, layout.first.w / layout.first.h);
    this.scene.updateMatrixWorld();
    this.person.update(dt, this.screen.surfaces);
    this.screen.update(dt);
    this.world.update(dt);
    this.audio.update();
    this.orbit.update();

    if (layout.outside) {
      const aspect = layout.outside.w / layout.outside.h;
      if (this.outsideCamera.aspect !== aspect) {
        this.outsideCamera.aspect = aspect;
        this.outsideCamera.updateProjectionMatrix();
      }
      this.renderPane(this.outsideCamera, layout.outside);
    }
    if (layout.first) this.renderPane(this.person.camera, layout.first);
  };

  private renderPane(camera: THREE.Camera, rect: PaneRect): void {
    const y = this.el.canvas.clientHeight - rect.y - rect.h; // WebGL counts from the bottom
    this.renderer.setViewport(rect.x, y, rect.w, rect.h);
    this.renderer.setScissor(rect.x, y, rect.w, rect.h);
    this.renderer.render(this.scene, camera);
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
