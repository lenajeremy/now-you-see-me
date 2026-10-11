import * as THREE from 'three';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { EYE_HEIGHT, STAGE_YAW, WORLD } from './config';

const FADE_SECONDS = 0.9;
/** How often a playing video re-lights the scene. */
const LIVE_LIGHT_SECONDS = 1;

/** How a panorama sits in the world and how it lights it. */
export interface PanoramaOptions {
  /** How far across the panorama (0–1) the part in front of the person is. Default: the middle. */
  facing?: number;
  /** How strongly the panorama lights the figure and the screen's frame. */
  skyLight?: number;
  /** Strength of the key light that casts shadows. */
  sunIntensity?: number;
}

/** A panorama on the dome (or fading out). */
interface Shown {
  skybox: GroundedSkybox;
  texture: THREE.VideoTexture;
  video: HTMLVideoElement;
}

/**
 * The world around the person: a 360° video projected onto a dome with a flat
 * floor (so the person seems to stand on its ground). The video also lights the
 * scene: its colours become the ambient light and its brightest spot the key
 * light, both refreshed as it plays, so they follow it from scene to scene.
 */
export class World {
  private readonly sun = new THREE.DirectionalLight(0xfff4e6, 1.4);
  private readonly floor: THREE.Mesh;
  private current: Shown | null = null;
  private outgoing: Shown | null = null;
  private fade = 1;
  private rotation = 0;
  private readonly pmrem: THREE.PMREMGenerator;
  /** A small copy of the current video frame, turned into lighting every second. */
  private readonly liveFrame = document.createElement('canvas');
  private readonly liveContext: CanvasRenderingContext2D;
  private readonly liveTexture: THREE.CanvasTexture;
  private liveLighting: THREE.WebGLRenderTarget | null = null;
  private liveCountdown = 0;
  private readonly sunTarget = new THREE.Vector3(0.4, 0.8, 0.4).normalize();
  private readonly sunDirection = this.sunTarget.clone();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.liveFrame.width = 256;
    this.liveFrame.height = 128;
    this.liveContext = this.liveFrame.getContext('2d', { willReadFrequently: true })!;
    this.liveTexture = new THREE.CanvasTexture(this.liveFrame);
    this.liveTexture.colorSpace = THREE.SRGBColorSpace;
    this.liveTexture.mapping = THREE.EquirectangularReflectionMapping;

    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 8;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    const shadowCam = sun.shadow.camera;
    shadowCam.left = shadowCam.bottom = -8;
    shadowCam.right = shadowCam.top = 8;
    shadowCam.near = 1;
    shadowCam.far = 50;
    scene.add(sun, sun.target);

    // Shows only shadows, over the panorama's own ground. It doesn't write depth,
    // so a panorama fading in can draw underneath it.
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    scene.add(this.floor);
  }

  /**
   * Puts a playing (or about to play) 360° video on the dome, cross-fading from
   * whatever was there. The caller owns the video element.
   */
  showVideo(video: HTMLVideoElement, options: PanoramaOptions = {}): void {
    if (this.fade < 1) this.finishFade();

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    // Projected from the person's eye height, so the first-person view sees the
    // panorama as it was shot.
    const skybox = new GroundedSkybox(texture, EYE_HEIGHT, WORLD.radius);
    skybox.position.y = EYE_HEIGHT - 0.01;
    // Turn the panorama so the chosen part sits in front of the person.
    this.rotation = STAGE_YAW - (0.25 - (options.facing ?? 0.5)) * Math.PI * 2;
    skybox.rotation.y = this.rotation;
    const material = skybox.material as THREE.MeshBasicMaterial;
    // The picture is already display-ready; don't tonemap it twice.
    material.toneMapped = false;
    sampleBicubic(material);

    if (this.current) {
      material.transparent = true;
      material.opacity = 0;
      skybox.renderOrder = -0.5; // drawn over the outgoing one
      this.fade = 0;
    } else {
      skybox.renderOrder = -1;
      this.fade = 1;
    }
    this.scene.add(skybox);
    this.outgoing = this.current;
    this.current = { skybox, texture, video };

    this.scene.environmentRotation.y = this.rotation;
    this.scene.environmentIntensity = options.skyLight ?? 1.2;
    this.sun.intensity = options.sunIntensity ?? 1.4;
    this.liveCountdown = 0; // light from the first frame that arrives
  }

  update(dt: number): void {
    this.updateLiveLighting(dt);
    // The key light eases toward the brightest part of the sky.
    this.sunDirection.lerp(this.sunTarget, 1 - Math.exp(-dt * 1.5)).normalize();
    this.sun.position.copy(this.sunDirection).multiplyScalar(20);

    if (this.fade >= 1 || !this.current) return;
    this.fade = Math.min(1, this.fade + dt / FADE_SECONDS);
    (this.current.skybox.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(this.fade, 0, 1);
    if (this.fade === 1) this.finishFade();
  }

  dispose(): void {
    for (const shown of [this.current, this.outgoing]) if (shown) this.release(shown);
    this.current = this.outgoing = null;
    this.scene.remove(this.sun, this.sun.target, this.floor);
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.sun.shadow.dispose();
    this.liveTexture.dispose();
    this.liveLighting?.dispose();
    this.pmrem.dispose();
    this.scene.environment = null;
  }

  /**
   * Lights the scene from what the video shows right now: its colours become the
   * ambient light, and its brightest spot is where the key light comes from.
   */
  private updateLiveLighting(dt: number): void {
    const video = this.current?.video;
    if (!video || video.readyState < 2) return;
    this.liveCountdown -= dt;
    if (this.liveCountdown > 0) return;
    this.liveCountdown = LIVE_LIGHT_SECONDS;

    const { width, height } = this.liveFrame;
    try {
      this.liveContext.drawImage(video, 0, 0, width, height);
    } catch {
      return; // the stream isn't readable (no CORS); keep the last lighting
    }
    this.liveTexture.needsUpdate = true;
    this.liveLighting = this.pmrem.fromEquirectangular(this.liveTexture, this.liveLighting);
    this.scene.environment = this.liveLighting.texture;

    const bright = brightestDirection(this.liveContext.getImageData(0, 0, width, height).data, width, height);
    const azimuth = Math.atan2(bright.z, bright.x);
    // Very low suns throw long shadows across everything; very high ones none at all.
    const elevation = THREE.MathUtils.clamp(Math.asin(bright.y), THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(70));
    this.sunTarget
      .set(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth))
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.rotation);
  }

  private finishFade(): void {
    this.fade = 1;
    if (this.current) {
      const material = this.current.skybox.material as THREE.MeshBasicMaterial;
      material.transparent = false;
      material.opacity = 1;
      material.needsUpdate = true;
      this.current.skybox.renderOrder = -1;
    }
    if (this.outgoing) {
      this.release(this.outgoing);
      this.outgoing = null;
    }
  }

  private release({ skybox, texture }: Shown): void {
    this.scene.remove(skybox);
    skybox.geometry.dispose();
    (skybox.material as THREE.Material).dispose();
    texture.dispose();
  }
}

/**
 * Samples the panorama with a bicubic (Catmull-Rom) filter instead of WebGL's
 * bilinear one. A view shows only a slice of the panorama, so its pixels are
 * magnified several times; bilinear blurs them, bicubic keeps edges crisp.
 * Nine bilinear taps make up the sixteen-texel kernel.
 */
function sampleBicubic(material: THREE.MeshBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CATMULL_ROM}`)
      .replace(
        'vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
        'vec4 sampledDiffuseColor = textureCatmullRom( map, vMapUv );',
      );
  };
}

const CATMULL_ROM = /* glsl */ `
vec4 textureCatmullRom( sampler2D tex, vec2 uv ) {
  vec2 size = vec2( textureSize( tex, 0 ) );
  vec2 position = uv * size;
  vec2 center = floor( position - 0.5 ) + 0.5;
  vec2 f = position - center;
  vec2 w0 = f * ( -0.5 + f * ( 1.0 - 0.5 * f ) );
  vec2 w1 = 1.0 + f * f * ( -2.5 + 1.5 * f );
  vec2 w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) );
  vec2 w3 = f * f * ( -0.5 + 0.5 * f );
  vec2 w12 = w1 + w2;
  vec2 p0 = ( center - 1.0 ) / size;
  vec2 p12 = ( center + w2 / w12 ) / size;
  vec2 p3 = ( center + 2.0 ) / size;
  vec4 color =
    ( texture2D( tex, vec2( p0.x, p0.y ) ) * w0.x + texture2D( tex, vec2( p12.x, p0.y ) ) * w12.x + texture2D( tex, vec2( p3.x, p0.y ) ) * w3.x ) * w0.y +
    ( texture2D( tex, vec2( p0.x, p12.y ) ) * w0.x + texture2D( tex, vec2( p12.x, p12.y ) ) * w12.x + texture2D( tex, vec2( p3.x, p12.y ) ) * w3.x ) * w12.y +
    ( texture2D( tex, vec2( p0.x, p3.y ) ) * w0.x + texture2D( tex, vec2( p12.x, p3.y ) ) * w12.x + texture2D( tex, vec2( p3.x, p3.y ) ) * w3.x ) * w3.y;
  // The kernel overshoots slightly at hard edges.
  return clamp( color, 0.0, 1.0 );
}
`;

/**
 * The average direction of the brightest pixels in the sky (the upper half) of
 * an equirectangular RGBA image. Averaging copes with a clipped white sun.
 */
function brightestDirection(pixels: Uint8ClampedArray, width: number, height: number): THREE.Vector3 {
  const sky = width * Math.floor(height / 2); // row 0 is the top of the image
  const luminance = (i: number) => 0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2];
  let max = 0;
  for (let i = 0; i < sky; i++) max = Math.max(max, luminance(i));
  const sum = new THREE.Vector3();
  const direction = new THREE.Vector3();
  for (let i = 0; i < sky; i++) {
    if (luminance(i) < max * 0.9) continue;
    // Inverse of three.js's equirectangular lookup.
    const phi = (((i % width) + 0.5) / width - 0.5) * Math.PI * 2;
    const lat = (0.5 - (Math.floor(i / width) + 0.5) / height) * Math.PI;
    sum.add(direction.set(Math.cos(lat) * Math.cos(phi), Math.sin(lat), Math.cos(lat) * Math.sin(phi)));
  }
  return sum.lengthSq() > 0 ? sum.normalize() : new THREE.Vector3(0, 1, 0);
}
