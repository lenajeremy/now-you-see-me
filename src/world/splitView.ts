import * as THREE from 'three';

export type ViewMode = 'split' | 'outside' | 'first';

/** A pane's area in CSS pixels, measured from the top-left of the canvas. */
export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where each view goes this frame; null when that view is collapsed. */
export interface Layout {
  outside: PaneRect | null;
  first: PaneRect | null;
}

const MIN_SHARE = 0.15;
const MAX_SHARE = 0.85;
/** Letting go of the divider this close to an edge collapses that side. */
const SNAP_SHARE = 0.07;

/**
 * The outside | first-person split. Owns the divider and the expand/restore
 * buttons, animates between modes, and positions the pane elements over the canvas.
 */
export class SplitView {
  private mode: ViewMode = 'split';
  /** The outside pane's share of the width when both views show. */
  private share = 0.5;
  /** The share actually on screen right now; animates toward the target. */
  private shown = 0.5;
  private dragging = false;
  private lastSplit = -1;
  private lastWidth = -1;
  private readonly listeners = new AbortController();
  /** Called whenever the mode changes, from a button, a key or the divider. */
  onModeChange: (mode: ViewMode) => void = () => {};

  constructor(
    private readonly root: HTMLElement,
    private readonly outsidePane: HTMLElement,
    private readonly firstPane: HTMLElement,
    private readonly divider: HTMLElement,
  ) {
    const signal = this.listeners.signal;
    divider.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.dragging = true;
      divider.setPointerCapture(e.pointerId);
      divider.classList.add('active');
    }, { signal });
    divider.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const rect = root.getBoundingClientRect();
      this.shown = THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1);
    }, { signal });
    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      divider.classList.remove('active');
      if (this.shown < SNAP_SHARE) this.setMode('first');
      else if (this.shown > 1 - SNAP_SHARE) this.setMode('outside');
      else this.share = THREE.MathUtils.clamp(this.shown, MIN_SHARE, MAX_SHARE);
    };
    divider.addEventListener('pointerup', endDrag, { signal });
    divider.addEventListener('pointercancel', endDrag, { signal });
    divider.addEventListener('dblclick', () => (this.share = 0.5), { signal });

    root.addEventListener('click', (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>('button');
      if (button?.dataset.solo) this.setMode(button.dataset.solo as ViewMode);
      else if (button && 'split' in button.dataset) this.setMode('split');
    }, { signal });
    // Pressing a button shouldn't also start a drag in the pane underneath it.
    for (const button of root.querySelectorAll('button')) {
      button.addEventListener('pointerdown', (e) => e.stopPropagation(), { signal });
    }
  }

  get currentMode(): ViewMode {
    return this.mode;
  }

  dispose(): void {
    this.listeners.abort();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.onModeChange(mode);
  }

  update(dt: number): Layout {
    const target = this.mode === 'outside' ? 1 : this.mode === 'first' ? 0 : this.share;
    if (!this.dragging) {
      this.shown = THREE.MathUtils.damp(this.shown, target, 14, dt);
      if (Math.abs(this.shown - target) < 0.0005) this.shown = target;
    }

    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const split = Math.round(this.shown * width);
    if (split !== this.lastSplit || width !== this.lastWidth) {
      this.lastSplit = split;
      this.lastWidth = width;
      this.outsidePane.style.left = '0px';
      this.outsidePane.style.width = `${split}px`;
      this.firstPane.style.left = `${split}px`;
      this.firstPane.style.width = `${width - split}px`;
      this.divider.style.left = `${split}px`;
    }

    return {
      outside: split >= 2 ? { x: 0, y: 0, w: split, h: height } : null,
      first: width - split >= 2 ? { x: split, y: 0, w: width - split, h: height } : null,
    };
  }
}
