/** Height of the person's eyes above the ground, in metres. */
export const EYE_HEIGHT = 1.6;

/**
 * Which way the stage (the screen) faces from the person, in radians around Y.
 * Each backdrop is turned so its chosen part sits there (see Backdrop.facing).
 */
export const STAGE_YAW = (0.25 - 0.55) * Math.PI * 2;

export const SCREEN = {
  /** Distance from the person to the screen. */
  distance: 4.5,
  centerY: 1.7,
  /** The picture is fitted inside this box, keeping the video's aspect ratio. */
  maxWidth: 3.6,
  maxHeight: 2.4,
};

export const WORLD = {
  /** How far away the backdrop dome sits. */
  radius: 80,
};

/** First-person zoom range: the vertical field of view, in degrees. */
export const FOV = { initial: 60, min: 30, max: 80 };

/** Objects on this layer are seen only by the outside camera, never through the person's eyes. */
export const OUTSIDE_ONLY_LAYER = 1;
