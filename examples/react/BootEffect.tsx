import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
import Core, { type BootEffectOptions, type BootLayout } from "boot-effect";

export interface BootEffectHandle {
  play(): void;
  pause(): void;
  restart(): void;
  skip(): void;
  seek(frame: number): void;
  readonly instance: Core | null;
}

export type BootEffectProps = Omit<BootEffectOptions, "onReady" | "onComplete"> & {
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
  onComplete?: (instance: Core) => void;
};

/**
 * React wrapper around boot-effect.
 *
 * `photo`, `sky` and `center` are read once, when the component mounts. These props are live:
 * layout, fit, focus, loop, speed, effectScale, sharpen, textScale, aspect.
 */
export const BootEffect = forwardRef<BootEffectHandle, BootEffectProps>(function BootEffect(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Core | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const { className, style, onReady, onComplete, onSkip, onError, onFrame, ...options } = latest.current;
    const fx = new Core(host.current, {
      ...options,
      onReady: () => latest.current.onReady?.(),
      onComplete: (done) => latest.current.onComplete?.(done),
      onSkip: () => latest.current.onSkip?.(),
      onError: (error) => latest.current.onError?.(error),
      onFrame: (frame) => latest.current.onFrame?.(frame)
    });
    instance.current = fx;
    return () => {
      fx.destroy();
      instance.current = null;
    };
  }, []);

  const { layout, fit, focus, loop, speed, effectScale, sharpen, textScale, aspect } = props;

  useEffect(() => {
    if (layout && typeof layout === "object") instance.current?.setLayout(layout as BootLayout);
  }, [layout]);

  useEffect(() => {
    instance.current?.setOptions({ fit, focus, loop, speed, effectScale, sharpen, textScale, aspect });
  }, [fit, focus, loop, speed, effectScale, sharpen, textScale, aspect]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => void instance.current?.play(),
      pause: () => void instance.current?.pause(),
      restart: () => void instance.current?.restart(),
      skip: () => void instance.current?.skip(),
      seek: (frame) => void instance.current?.seek(frame),
      get instance() {
        return instance.current;
      }
    }),
    []
  );

  return <div ref={host} className={props.className} style={props.style} />;
});

export default BootEffect;
