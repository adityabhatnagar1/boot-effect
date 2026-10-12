export type Anchor =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | "left"
  | "right";

export type Length = number | string;

export interface BootLayout {
  position?: "static" | "relative" | "absolute" | "fixed";
  anchor?: Anchor | null;
  top?: Length | null;
  left?: Length | null;
  right?: Length | null;
  bottom?: Length | null;
  /** Default "100%". */
  width?: Length;
  /** "auto" (default): the height follows `aspect`. Any other value fills the box, whatever its shape. */
  height?: Length;
  maxWidth?: Length | null;
  maxHeight?: Length | null;
  zIndex?: number | null;
  transform?: string;
  /** Alias of the top-level `fit` option. */
  fit?: "cover" | "contain" | "fill";
}

export type PhotoSource = string | HTMLImageElement | ImageBitmap | HTMLCanvasElement;
export type UV = [number, number];

export interface SkyOptions {
  mode?: "blue" | "haze" | "warm";
  /** Haze mode: luminance range (relative to the 95th percentile) that counts as sky. */
  lo?: number;
  hi?: number;
  /** Haze mode: local-contrast range that still counts as smooth. */
  sdLo?: number;
  sdHi?: number;
  /** 0..1. Nothing below this fraction of the photo height is sky (stops water reflections). */
  horizon?: number;
  /** Keep only sky that is connected to the top edge. Default: true for "warm". */
  connected?: boolean;
}

export interface BootEffectOptions {
  autoplay?: boolean;
  loop?: boolean;
  /** Playback speed multiplier. Default 1. */
  speed?: number;
  /** Skip the animation when the visitor prefers reduced motion. Default true. */
  respectReducedMotion?: boolean;
  hideOnComplete?: boolean;
  /** Pause while the tab is hidden. Default true. */
  pauseWhenHidden?: boolean;
  /** "inline" (default), "fullscreen" (fixed, 100vw by 100dvh) or an explicit layout. */
  layout?: "inline" | "fullscreen" | BootLayout;
  /** Box aspect when the height is "auto". "auto" is 9:16 in portrait windows and 16:9 in landscape ones. */
  aspect?: "auto" | "16/9" | "9/16" | number;
  /** cover: fill the box and crop (default). contain: show the whole photo, extend the sky colour. fill: stretch. */
  fit?: "cover" | "contain" | "fill";
  /** Photo point (UV) kept at the middle of the box, interpolated by aspect ratio. */
  focus?: { portrait?: UV; landscape?: UV } | null;
  /** The photograph. One image for every orientation, or separate portrait and landscape art. */
  photo: PhotoSource | { default?: PhotoSource; portrait?: PhotoSource; landscape?: PhotoSource };
  /** Polar centre of the effect in photo UV. Default: the middle of the largest circle of sky. */
  center?: UV | { default?: UV; portrait?: UV; landscape?: UV } | null;
  /** Sky detection. "auto" picks warm, blue or haze rules per photo. */
  sky?: "auto" | "blue" | "haze" | "warm" | SkyOptions;
  /** Darkening of non-sky pixels during the grid phase, 0..1. "auto": 1 blue sky, 0.6 warm, 0.3 haze. */
  grade?: "auto" | number;
  /** Multiplier on the automatic effect size. */
  effectScale?: number;
  sharpen?: "auto" | number;
  textScale?: number;
  /** Device-pixel-ratio cap. Default 3. */
  maxPixelRatio?: number;
  /** Total pixel budget. Default 14.7e6 (about 5K). */
  maxPixels?: number;
  /** Lower the render resolution automatically if frames take too long. Default true. */
  adaptive?: boolean;
  /** Without WebGL: "photo" (default) shows the still image, "none" leaves the box empty. */
  fallback?: "photo" | "none";
  /** Accessible label of the element. */
  label?: string;
  onReady?: (fx: BootEffect) => void;
  onComplete?: (fx: BootEffect) => void;
  onSkip?: () => void;
  onError?: (error: Error) => void;
  onFrame?: (frame: number) => void;
}

export interface BootSize {
  cssWidth: number;
  cssHeight: number;
  width: number;
  height: number;
  pixelRatio: number;
}

export interface BootAnalysis {
  /** The sky rule that was applied. */
  mode: "blue" | "haze" | "warm";
  /** Centre of the largest circle of sky, in photo UV. */
  centre: UV;
  /** Radius of that circle as a fraction of the photo width. */
  radius: number;
  /** Distance from the centre to the farthest sky pixel, as a fraction of the photo width. */
  reach: number;
  /** Mean sky colour, 0..1 per channel. */
  skyColour: [number, number, number];
  /** R: sky mask, G: luma, B: local contrast. */
  mask: ImageData;
}

export default class BootEffect {
  static readonly VERSION: string;
  static readonly FRAMES: 250;
  static readonly FPS: 30;
  static readonly DURATION: number;
  static supported(): boolean;

  constructor(target: Element | string | null, options: BootEffectOptions);

  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly frame: number;
  /** 0..1 */
  readonly progress: number;
  readonly playing: boolean;
  readonly ready: boolean;
  readonly finished: boolean;
  readonly size: BootSize | undefined;
  /** Resolves when playback completes, is skipped, or the instance is destroyed. */
  readonly done: Promise<BootEffect>;
  opts: BootEffectOptions;

  setLayout(patch: BootLayout | "fullscreen" | "inline"): this;
  setPosition(patch: BootLayout): this;
  setSize(width: Length, height?: Length): this;
  setOptions(patch: Partial<BootEffectOptions>): this;

  play(): this;
  pause(): this;
  /** Pause and show frame 0. */
  stop(): this;
  restart(): this;
  /** Jump to the last frame and fire onComplete. */
  skip(): this;
  seek(frame: number): this;
  seekTime(ms: number): this;
  renderFrame(frame: number): void;

  analysis(): BootAnalysis | null;
  snapshot(type?: string, quality?: number): string;
  destroy(): void;
}
