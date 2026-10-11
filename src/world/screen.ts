import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SCREEN } from './config';

const BEZEL = 0.05;
const DEPTH = 0.07;
/** How bright the screen's light on the figure is when it shows a full-white picture. */
const GLOW_INTENSITY = 30;
const ACCENT = 0x9ad8ff;
const FONT = 'ui-sans-serif, system-ui, -apple-system, sans-serif';

interface Message {
  title: string;
  detail: string;
  /** Animate rings and make the frame glow, for ringing. */
  pulse: boolean;
}

interface Size {
  w: number;
  h: number;
}

/** The largest picture of the given aspect ratio that fits the screen's box. */
function fit(aspect: number): Size {
  return aspect >= SCREEN.maxWidth / SCREEN.maxHeight
    ? { w: SCREEN.maxWidth, h: SCREEN.maxWidth / aspect }
    : { w: SCREEN.maxHeight * aspect, h: SCREEN.maxHeight };
}

/**
 * The big screen standing in the world, facing +Z (toward the person).
 * It shows either a text message or a live video, and reshapes to the video.
 */
export class WorldScreen {
  readonly group = new THREE.Group();
  /** The middle of the picture, where the screen's sound comes from. */
  readonly speaker = new THREE.Group();
  /** Called when the screen is shown or hidden. */
  onVisibilityChange: (visible: boolean) => void = () => {};

  private readonly display: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly frame: THREE.Mesh<RoundedBoxGeometry, THREE.MeshStandardMaterial>;
  private readonly glow: THREE.SpotLight;
  private readonly glowTarget = new THREE.Color();
  private readonly messageCanvas = document.createElement('canvas');
  private readonly messageTexture: THREE.CanvasTexture;
  private readonly sampleCanvas = document.createElement('canvas');
  private readonly sampleContext: CanvasRenderingContext2D;
  private sampleCountdown = 0;
  private video: HTMLVideoElement | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private videoListeners: AbortController | null = null;
  private message: Message | null = null;
  private pulsePhase = 0;
  private readonly parts: THREE.Object3D[];
  private shown = true;
  /** 0 (hidden) to 1 (shown), animated: hiding shrinks the screen down into the ground. */
  private presence = 1;
  private size = fit(16 / 9);
  private targetSize = this.size;

  constructor() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.6, roughness: 0.35 });

    // Its own material, so the frame can glow while ringing without the stand glowing too.
    this.frame = new THREE.Mesh(frameGeometry(this.size), metal.clone());
    this.frame.material.emissive.set(ACCENT);
    this.frame.material.emissiveIntensity = 0;
    this.frame.castShadow = true;

    this.messageCanvas.width = 1280;
    this.messageCanvas.height = 720;
    this.messageTexture = new THREE.CanvasTexture(this.messageCanvas);
    this.messageTexture.colorSpace = THREE.SRGBColorSpace;
    this.messageTexture.anisotropy = 8;

    this.display = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.messageTexture, toneMapped: false }),
    );
    this.display.position.z = DEPTH / 2 + 0.002;

    const panel = this.speaker;
    panel.position.y = SCREEN.centerY;
    panel.add(this.frame, this.display);

    // Stand: a pole behind the panel on a round foot.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, SCREEN.centerY, 24), metal);
    pole.position.set(0, SCREEN.centerY / 2, -DEPTH / 2 - 0.05);
    const matte = new THREE.MeshStandardMaterial({ color: 0x1a1c21, metalness: 0.1, roughness: 0.8 });
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.05, 48), matte);
    foot.position.set(0, 0.025, -DEPTH / 2 - 0.05);
    pole.castShadow = foot.castShadow = true;

    // Light thrown from the picture toward the person, tinted by what's on screen.
    this.glow = new THREE.SpotLight(0xffffff, GLOW_INTENSITY, 14, THREE.MathUtils.degToRad(60), 1, 2);
    this.glow.position.set(0, SCREEN.centerY, 0.3);
    this.glow.target.position.set(0, 1.2, SCREEN.distance);

    this.group.add(panel, pole, foot, this.glow, this.glow.target);
    this.group.position.set(0, 0, -SCREEN.distance);
    this.parts = [this.display, this.frame];

    this.sampleCanvas.width = this.sampleCanvas.height = 8;
    this.sampleContext = this.sampleCanvas.getContext('2d', { willReadFrequently: true })!;

    this.applySize();
  }

  /** Meshes the person's gaze can land on, and that can be clicked. None while hidden. */
  get surfaces(): THREE.Object3D[] {
    return this.shown ? this.parts : [];
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Stops listening to the video it shows. (Its meshes are freed with the scene.) */
  dispose(): void {
    this.detachVideo();
  }

  /** Shows or hides the screen (animated). Its sound keeps coming from where it stands. */
  setVisible(visible: boolean): void {
    if (visible === this.shown) return;
    this.shown = visible;
    this.onVisibilityChange(visible);
  }

  /** Shows a title and an optional line of detail on a dark background. */
  showMessage(title: string, detail = '', { pulse = false } = {}): void {
    const m = this.message;
    if (m && m.title === title && m.detail === detail && m.pulse === pulse) return;
    this.detachVideo();
    this.message = { title, detail, pulse };
    this.pulsePhase = 0;
    this.drawMessage();
    this.display.material.map = this.messageTexture;
    this.glowTarget.setRGB(0.12, 0.14, 0.2);
    this.targetSize = fit(16 / 9);
  }

  /** Plays a video on the screen. `mirror` flips it left-to-right, like a mirror. */
  showVideo(video: HTMLVideoElement, { mirror = false } = {}): void {
    if (this.video === video) return;
    this.detachVideo();
    this.message = null;

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8; // stays crisp when seen at an angle
    if (mirror) {
      texture.repeat.x = -1;
      texture.offset.x = 1;
    }
    this.video = video;
    this.videoTexture = texture;
    this.display.material.map = texture;

    const fitToVideo = () => {
      if (video.videoWidth && video.videoHeight) this.targetSize = fit(video.videoWidth / video.videoHeight);
    };
    this.videoListeners = new AbortController();
    video.addEventListener('loadedmetadata', fitToVideo, { signal: this.videoListeners.signal });
    video.addEventListener('resize', fitToVideo, { signal: this.videoListeners.signal });
    fitToVideo();
  }

  update(dt: number): void {
    this.presence = THREE.MathUtils.damp(this.presence, this.shown ? 1 : 0, 9, dt);
    if (Math.abs(this.presence - (this.shown ? 1 : 0)) < 0.001) this.presence = this.shown ? 1 : 0;
    // Shrinks toward the foot of its stand, on the ground.
    const scale = THREE.MathUtils.smootherstep(this.presence, 0, 1);
    this.group.scale.setScalar(Math.max(scale, 0.0001));
    this.group.visible = this.presence > 0.002;
    this.glow.intensity = GLOW_INTENSITY * this.presence;

    const { w, h } = this.size;
    const target = this.targetSize;
    if (Math.abs(target.w - w) > 1e-4 || Math.abs(target.h - h) > 1e-4) {
      this.size = {
        w: THREE.MathUtils.damp(w, target.w, 8, dt),
        h: THREE.MathUtils.damp(h, target.h, 8, dt),
      };
      this.applySize();
    }

    // Sample the picture's average colour a few times a second for the glow.
    this.sampleCountdown -= dt;
    if (this.video && this.video.readyState >= 2 && this.sampleCountdown <= 0) {
      this.sampleCountdown = 0.15;
      this.sampleContext.drawImage(this.video, 0, 0, 8, 8);
      const pixels = this.sampleContext.getImageData(0, 0, 8, 8).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];
      }
      const n = (pixels.length / 4) * 255;
      this.glowTarget.setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace);
    }
    this.glow.color.lerp(this.glowTarget, 1 - Math.exp(-dt * 6));

    // Ringing: redraw the rings and breathe the frame's glow.
    const pulsing = this.message?.pulse ?? false;
    if (pulsing) {
      this.pulsePhase += dt;
      this.drawMessage();
    }
    const breath = pulsing ? 0.3 + 0.3 * Math.sin(this.pulsePhase * Math.PI * 2 * 0.8) : 0;
    this.frame.material.emissiveIntensity = THREE.MathUtils.damp(this.frame.material.emissiveIntensity, breath, 10, dt);
  }

  private drawMessage(): void {
    const { title, detail, pulse } = this.message!;
    const ctx = this.messageCanvas.getContext('2d')!;
    const { width: w, height: h } = this.messageCanvas;
    const bg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, w * 0.7);
    bg.addColorStop(0, '#1d2230');
    bg.addColorStop(1, '#07080b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (pulse) {
      // Three rings spreading out from the middle, one after another.
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const t = (this.pulsePhase * 0.5 + i / 3) % 1;
        ctx.strokeStyle = `rgba(154, 216, 255, ${(1 - t) * 0.4})`;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 90 + t * 380, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f3f1ec';
    ctx.font = `600 64px ${FONT}`;
    ctx.fillText(title, w / 2, detail ? h / 2 - 34 : h / 2, w * 0.86);
    if (detail) {
      ctx.fillStyle = 'rgba(243, 241, 236, 0.6)';
      ctx.font = `400 32px ${FONT}`;
      ctx.fillText(detail, w / 2, h / 2 + 40, w * 0.86);
    }
    this.messageTexture.needsUpdate = true;
  }

  private detachVideo(): void {
    this.videoListeners?.abort();
    this.videoListeners = null;
    this.videoTexture?.dispose();
    this.videoTexture = null;
    this.video = null;
  }

  private applySize(): void {
    this.display.scale.set(this.size.w, this.size.h, 1);
    this.frame.geometry.dispose();
    this.frame.geometry = frameGeometry(this.size);
  }
}

function frameGeometry({ w, h }: Size): RoundedBoxGeometry {
  return new RoundedBoxGeometry(w + BEZEL * 2, h + BEZEL * 2, DEPTH, 3, 0.03);
}
