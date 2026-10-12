/*!
 * boot-effect v__VERSION__
 * A procedural polar-grid / corrupted-boot intro for any photograph.
 * One still image, one WebGL fragment shader, one canvas text layer. No video, no audio, no dependencies.
 *
 * UMD: <script src="boot-effect.js"> -> window.BootEffect
 *      require("boot-effect") | import BootEffect from "boot-effect"
 *
 * MIT License
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    module.exports.default = module.exports;
  } else {
    root.BootEffect = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var REF_WIDTH = 720; // effect geometry is authored in pixels of a 720px-wide reference frame
  var FPS = 30;
  var FRAMES = 250;
  var AUX_MAX = 1600; // longest side of the analysis image
  var REF_SPECKLE_DENSITY = 0.0885; // mean edge density the speckle phase was tuned against
  var DEFAULT_FOCUS = { portrait: [0.5, 0.5], landscape: [0.5, 0.345] };

  // ------------------------------------------------------------------------------------------------
  // Timeline
  // ------------------------------------------------------------------------------------------------

  // Render modes, shared with the fragment shader (uMode).
  var PHOTO = 0; // the photograph, untouched
  var GRID = 1; // polar grid growing out of the sky
  var THRESHOLD = 2; // hard black / white cut of the photo
  var MOSAIC = 3; // 9px mosaic of the photo
  var BLUE = 4; // flat blue screen
  var GHOST = 5; // blue screen with a tinted ghost of the photo
  var SPECKLE = 6; // blue screen with speckle ink drawn from the photo's edges

  function modeAt(f) {
    if (f <= 3) return PHOTO;
    if (f <= 5) return SPECKLE;
    if (f < 14) return PHOTO;
    if (f <= 203) return GRID;
    if (f <= 205) return THRESHOLD;
    if (f <= 208) return MOSAIC;
    if (f <= 214) return BLUE;
    if (f <= 217) return GHOST;
    if (f <= 221) return BLUE;
    if (f <= 226) return SPECKLE;
    if (f <= 229) return BLUE;
    if (f <= 232) return PHOTO;
    if (f <= 237) return BLUE;
    return SPECKLE;
  }

  // Piecewise-linear lookup. Each row is [frame, value, value, ...].
  function keys(table, f) {
    var n = table.length, i, a, b, t, out, j;
    if (f <= table[0][0]) return table[0].slice(1);
    if (f >= table[n - 1][0]) return table[n - 1].slice(1);
    for (i = 0; i < n - 1; i++) if (f <= table[i + 1][0]) break;
    a = table[i];
    b = table[i + 1];
    t = (f - a[0]) / (b[0] - a[0]);
    out = [];
    for (j = 1; j < a.length; j++) out.push(a[j] + (b[j] - a[j]) * t);
    return out;
  }

  // Radius of the clear disc in the sky, in reference pixels.
  var DISC_RADIUS = [
    [26, 302.3], [28, 256.3], [30, 217], [32, 183.9], [34, 155.6], [36, 131.8], [38, 112], [40, 96.3],
    [42, 83.2], [44, 72.8], [46, 65.7], [48, 61.1], [50, 59.3], [52, 58.9], [54, 60.1], [56, 60.6],
    [58, 63.2], [60, 67.9], [68, 67.6], [150, 67.5], [176, 67], [184, 45], [190, 17], [198, 6], [203, 6]
  ];
  var MACRO_RINGS = [[44, 0], [70, 1], [250, 1]]; // coarse ring lines outside the disc
  var DIALOG_REVEAL = [[50, 0], [100, 1], [250, 1]]; // how many dialog tiles have appeared
  var DIALOG_FADE = [[148, 0], [178, 1]]; // dialog tiles dropping out again
  var DISC_FILL = [[130, 0], [145, 0.12], [152, 0.2], [160, 0.27], [170, 0.43], [180, 0.5], [190, 0.6], [197, 0.97], [198, 1]];
  var SPARKS = [[130, 0], [140, 0.6], [165, 1], [176, 0.3], [185, 0]];
  // Glow colour around the disc: [frame, r, g, b, alpha, ring mix]
  var GLOW = [
    [118, 1, 0.94, 0, 0, 0], [124, 1, 0.94, 0.16, 0.6, 0], [134, 1, 0.94, 0.16, 0.55, 0], [137, 1, 0.94, 0.16, 0.4, 0],
    [139, 0.94, 0.24, 0.78, 0.75, 1], [146, 0.9, 0.31, 0.82, 0.7, 1], [152, 0.67, 0.55, 0.92, 0.55, 1],
    [166, 0.67, 0.59, 0.94, 0.4, 1], [178, 0, 0, 0, 0, 1]
  ];
  // Characters of the stop screen typed so far, by frame.
  var TYPED = [
    [209, 0], [210, 0.75], [211, 1.62], [212, 5.18], [213, 6.9], [214, 7.4], [218, 11.93], [219, 12.76], [220, 15.3],
    [221, 16.64], [227, 26.54], [228, 27.44], [229, 29.43], [233, 35.03], [234, 36.39], [235, 37.28], [236, 39.24],
    [237, 40.06], [249, 58]
  ];

  var STOP_HEADER = [
    "A problem has been detected and Windows has been",
    "shut down to prevent damage to your computer.",
    "",
    "FATAL_SYSTEM_ERROR",
    "",
    "If this is the first time you\u2019ve seen this Stop",
    "error screen, restart your computer. If this",
    "screen appears again, follow these steps:",
    "",
    "Check to make sure any new hardware or software",
    "is properly installed.",
    "If this is a new installation, ask your hardware",
    "or software manufacturer for any Windows updates",
    "you might need.",
    "",
    "Technical Information:"
  ];
  var STOP_CODE_A = ["*** STOP: 0x0000004E (0x00000007, 0x0", "0000004, 0x00000000, 0x00000000)", "*** PFN_LIST_CORRUPT"];
  var STOP_CODE_B = ["*** STOP: 0x0000004E (0x00000007, 0x00000004", "0x00000000, 0x00000000)", "*** PFN_LIST_CORRUPT"];
  var LINES = [].concat(STOP_HEADER, STOP_CODE_A, [""], STOP_HEADER, STOP_CODE_B, STOP_HEADER, STOP_CODE_B);

  function frameState(frame) {
    var f = Math.max(0, Math.min(FRAMES - 1, frame | 0));
    var mode = modeAt(f);
    var s = { f: f, mode: mode, thr: 0, typed: -1 };

    if (mode === SPECKLE) s.thr = f < 230 ? 1.5 : 2.7; // speckle density
    if (mode === THRESHOLD) s.thr = 0.236;
    if (f >= 209 && (mode === BLUE || mode === GHOST || mode === SPECKLE)) s.typed = keys(TYPED, f)[0];

    if (mode === GRID) {
      s.R = f <= 26 ? 302.3 * Math.exp(0.0824 * (26 - f)) : keys(DISC_RADIUS, f)[0];
      s.macro = keys(MACRO_RINGS, f)[0];
      s.reveal = keys(DIALOG_REVEAL, f)[0];
      s.fade = keys(DIALOG_FADE, f)[0];
      s.disc = keys(DISC_FILL, f)[0];
      s.dots = keys(SPARKS, f)[0];
      s.tint = keys(GLOW, f);
    }
    return s;
  }

  var FRAGMENT_SHADER = __SHADER__;
  var VERTEX_SHADER = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  // ------------------------------------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------------------------------------

  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }

  function smooth(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function merge(target, source) {
    if (source) {
      Object.keys(source).forEach(function (k) {
        if (source[k] !== undefined) target[k] = source[k];
      });
    }
    return target;
  }

  function cssLength(v) {
    return typeof v === "number" ? v + "px" : v == null ? "" : v;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      if (src && typeof src === "object" && (src.width || src.naturalWidth)) return resolve(src); // Image, ImageBitmap, canvas
      var img = new Image();
      if (typeof src === "string" && !/^data:|^blob:/.test(src)) img.crossOrigin = "anonymous";
      img.onload = function () {
        if (img.decode) img.decode().then(function () { resolve(img); }, function () { resolve(img); });
        else resolve(img);
      };
      img.onerror = function () {
        reject(new Error("BootEffect: cannot load photo " + String(src).slice(0, 80)));
      };
      img.src = src;
    });
  }

  function dims(img) {
    return [img.naturalWidth || img.width, img.naturalHeight || img.height];
  }

  // ------------------------------------------------------------------------------------------------
  // Photo analysis
  //
  // Produces the aux texture (R: soft sky mask, G: luma, B: local contrast) and the statistics the
  // renderer needs: where the largest circle of sky is, how far the sky reaches, the mean sky colour.
  //
  // Sky modes:
  //   blue  clear blue sky (colour rule)
  //   haze  fog, overcast or milky sky (bright and smooth)
  //   warm  sunrise, sunset, dusk: saturated clouds plus pale glow, kept only where connected to the
  //         top edge so that a mirrored reflection on water is never mistaken for sky
  // "auto" picks per photo. Every mode honours { horizon } (nothing below that fraction of the height).
  // ------------------------------------------------------------------------------------------------

  // Separable box blur with running sums, clamped edges.
  function boxBlur(src, dst, w, h, rad, tmp) {
    var x, y, acc, cnt, row, add, rem, k;
    for (y = 0; y < h; y++) {
      row = y * w;
      acc = 0;
      cnt = 0;
      for (k = 0; k <= rad && k < w; k++) { acc += src[row + k]; cnt++; }
      for (x = 0; x < w; x++) {
        tmp[row + x] = acc / cnt;
        add = x + rad + 1;
        rem = x - rad;
        if (add < w) { acc += src[row + add]; cnt++; }
        if (rem >= 0) { acc -= src[row + rem]; cnt--; }
      }
    }
    for (x = 0; x < w; x++) {
      acc = 0;
      cnt = 0;
      for (k = 0; k <= rad && k < h; k++) { acc += tmp[k * w + x]; cnt++; }
      for (y = 0; y < h; y++) {
        dst[y * w + x] = acc / cnt;
        add = y + rad + 1;
        rem = y - rad;
        if (add < h) { acc += tmp[add * w + x]; cnt++; }
        if (rem >= 0) { acc -= tmp[rem * w + x]; cnt--; }
      }
    }
  }

  // Zeroes every sky pixel that cannot be reached from the top edge. Returns false if nothing seeds.
  function keepConnected(sky, w, h, seedRows) {
    var n = w * h;
    var seen = new Uint8Array(n);
    var queue = new Int32Array(n);
    var head = 0, tail = 0, i, p, x;
    var seedEnd = Math.min(n, seedRows * w);

    for (i = 0; i < seedEnd; i++) {
      if (sky[i] > 0.5) { seen[i] = 1; queue[tail++] = i; }
    }
    if (!tail) return false;

    while (head < tail) {
      p = queue[head++];
      x = p % w;
      if (x > 0 && !seen[p - 1] && sky[p - 1] > 0.2) { seen[p - 1] = 1; queue[tail++] = p - 1; }
      if (x < w - 1 && !seen[p + 1] && sky[p + 1] > 0.2) { seen[p + 1] = 1; queue[tail++] = p + 1; }
      if (p >= w && !seen[p - w] && sky[p - w] > 0.2) { seen[p - w] = 1; queue[tail++] = p - w; }
      if (p < n - w && !seen[p + w] && sky[p + w] > 0.2) { seen[p + w] = 1; queue[tail++] = p + w; }
    }
    for (i = 0; i < n; i++) if (!seen[i]) sky[i] = 0;
    return true;
  }

  // Largest circle that fits inside the sky mask (chamfer distance transform on a small copy).
  // The image border counts as an obstacle. Returns { uv, radius } with the radius as a fraction of the width.
  function largestSkyCircle(mask, w, h) {
    var ds = Math.max(1, Math.floor(Math.max(w, h) / 256));
    var dw = Math.floor(w / ds), dh = Math.floor(h / ds);
    var W2 = dw + 2, H2 = dh + 2;
    var d = new Float32Array(W2 * H2);
    var x, y, k, best = 0, bx = 0, by = 0;

    function min2(a, b) { return a < b ? a : b; }

    for (y = 0; y < dh; y++) {
      for (x = 0; x < dw; x++) d[(y + 1) * W2 + x + 1] = mask[y * ds * w + x * ds] > 0.7 ? 1e6 : 0;
    }
    for (y = 1; y < H2 - 1; y++) {
      for (x = 1; x < W2 - 1; x++) {
        k = y * W2 + x;
        if (d[k]) d[k] = min2(min2(d[k], d[k - 1] + 1), min2(min2(d[k - W2] + 1, d[k - W2 - 1] + 1.414), d[k - W2 + 1] + 1.414));
      }
    }
    for (y = H2 - 2; y >= 1; y--) {
      for (x = W2 - 2; x >= 1; x--) {
        k = y * W2 + x;
        if (d[k]) d[k] = min2(min2(d[k], d[k + 1] + 1), min2(min2(d[k + W2] + 1, d[k + W2 + 1] + 1.414), d[k + W2 - 1] + 1.414));
      }
    }
    for (y = 1; y < H2 - 1; y++) {
      for (x = 1; x < W2 - 1; x++) {
        if (d[y * W2 + x] > best) { best = d[y * W2 + x]; bx = x - 1; by = y - 1; }
      }
    }
    if (best >= 1 && best < 1e5) return { uv: [(bx + 0.5) / dw, (by + 0.5) / dh], radius: (best * ds) / w };
    return { uv: [0.5, 0.3], radius: 0.12 };
  }

  function analysePhoto(img, pw, ph, skyOption) {
    var scale = Math.min(1, AUX_MAX / Math.max(pw, ph));
    var w = Math.max(2, Math.round(pw * scale));
    var h = Math.max(2, Math.round(ph * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    var rgba = ctx.getImageData(0, 0, w, h).data;
    var n = w * h;
    var out = new Uint8ClampedArray(n * 4);
    var luma = new Float32Array(n), luma2 = new Float32Array(n), hist = new Float32Array(256);
    var bandPixels = Math.max(1, Math.round(h * 0.08)) * w;
    var blue = 0, warmTop = 0, i;

    for (i = 0; i < n; i++) {
      var r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      luma[i] = lum;
      luma2[i] = lum * lum;
      hist[Math.min(255, (lum * 255) | 0)]++;
      if (b - r > 45 && lum > 0.4) blue++;
      if (i < bandPixels) {
        var mx = Math.max(r, g, b);
        if (lum > 0.25 && r - g > 12 && mx - Math.min(r, g, b) > 0.25 * mx) warmTop++;
      }
      out[i * 4 + 1] = lum * 255;
      out[i * 4 + 3] = 255;
    }

    function quantile(q) {
      var acc = 0, k;
      for (k = 0; k < 256; k++) {
        acc += hist[k];
        if (acc >= q * n) return (k + 1) / 255;
      }
      return 1;
    }

    var tmp = new Float32Array(n), mean = new Float32Array(n), mean2 = new Float32Array(n);
    var sd = new Float32Array(n), sky = new Float32Array(n), soft = new Float32Array(n);
    boxBlur(luma, mean, w, h, 4, tmp);
    boxBlur(luma2, mean2, w, h, 4, tmp);
    for (i = 0; i < n; i++) sd[i] = Math.sqrt(Math.max(0, mean2[i] - mean[i] * mean[i]));

    var opt = typeof skyOption === "object" && skyOption ? skyOption : { mode: skyOption || "auto" };
    var mode = opt.mode || "auto";
    if (mode === "auto") mode = warmTop / bandPixels > 0.25 ? "warm" : blue / n > 0.08 ? "blue" : "haze";

    var p95 = quantile(0.95);
    var lo = opt.lo != null ? opt.lo : 0.54 * p95;
    var hi = opt.hi != null ? opt.hi : 0.86 * p95;
    var sdLo = opt.sdLo != null ? opt.sdLo : 0.015;
    var sdHi = opt.sdHi != null ? opt.sdHi : 0.05;
    var horizon = opt.horizon != null ? +opt.horizon : -1;
    var connected = opt.connected != null ? !!opt.connected : mode === "warm";

    for (i = 0; i < n; i++) {
      if (mode === "blue") {
        sky[i] = smooth(30, 60, rgba[i * 4 + 2] - rgba[i * 4]) * smooth(0.3, 0.45, luma[i]);
      } else if (mode === "warm") {
        var rr = rgba[i * 4], gg = rgba[i * 4 + 1], bb = rgba[i * 4 + 2];
        var greenLead = gg - Math.max(rr, bb); // negative for orange, pink, violet, lavender; positive for foliage
        var clouds = smooth(28, 46, -greenLead) * smooth(0.1, 0.22, luma[i]);
        var glow = smooth(0.62, 0.76, luma[i]) * (1 - smooth(3, 20, greenLead));
        sky[i] = Math.max(clouds, glow);
      } else {
        sky[i] = smooth(lo, hi, mean[i]) * (1 - smooth(sdLo, sdHi, sd[i]));
      }
    }

    if (horizon >= 0) {
      for (var y = 0; y < h; y++) {
        var cap = 1 - smooth(horizon - 0.012, horizon + 0.012, (y + 0.5) / h);
        if (cap < 1) for (var x = 0; x < w; x++) sky[y * w + x] *= cap;
      }
    }
    if (connected) keepConnected(sky, w, h, Math.max(2, Math.round(h * 0.03)));
    boxBlur(sky, soft, w, h, 1, tmp);

    var wSum = 0, rSum = 0, gSum = 0, bSum = 0, ink = 0;
    for (i = 0; i < n; i++) {
      var s = soft[i];
      out[i * 4] = s * 255;
      out[i * 4 + 2] = Math.min(1, sd[i] * 4) * 255;
      wSum += s;
      rSum += s * rgba[i * 4];
      gSum += s * rgba[i * 4 + 1];
      bSum += s * rgba[i * 4 + 2];
      ink += 0.4 * smooth(0, 0.07, sd[i]) * (1 - s);
    }
    var skyColour = wSum > n * 0.01 ? [rSum / wSum / 255, gSum / wSum / 255, bSum / wSum / 255] : [0.482, 0.651, 0.855];

    var circle = largestSkyCircle(soft, w, h);
    var reach = 0;
    for (var yy = 0; yy < h; yy += 2) {
      for (var xx = 0; xx < w; xx += 2) {
        if (soft[yy * w + xx] > 0.5) {
          var dx = xx / w - circle.uv[0];
          var dy = ((yy / h - circle.uv[1]) * h) / w;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > reach) reach = dist;
        }
      }
    }

    return {
      data: new ImageData(out, w, h),
      stats: {
        mode: mode,
        reach: reach,
        skyColour: skyColour,
        thresholdLuma: quantile(0.39),
        inkScale: clamp(REF_SPECKLE_DENSITY / Math.max(ink / n, 1e-4), 0.25, 4),
        centre: circle.uv,
        radius: circle.radius
      }
    };
  }

  // ------------------------------------------------------------------------------------------------
  // Component
  // ------------------------------------------------------------------------------------------------

  var DEFAULTS = {
    autoplay: true,
    loop: false,
    speed: 1,
    respectReducedMotion: true,
    hideOnComplete: false,
    pauseWhenHidden: true,
    layout: "inline", // "inline" | "fullscreen" | { position, anchor, top, left, right, bottom, width, height, maxWidth, maxHeight, zIndex, transform }
    aspect: "auto", // box aspect when layout.height is "auto": "auto" (9:16 portrait, 16:9 landscape) | "16/9" | "9/16" | number
    fit: "cover", // "cover" (fill, crop) | "contain" (whole photo, sky colour extended) | "fill" (stretch)
    focus: null, // { portrait: [u, v], landscape: [u, v] }: photo point kept at the middle of the box
    photo: null, // string | Image | ImageBitmap | canvas | { default, portrait, landscape }
    center: null, // polar centre in photo UV: [u, v] | { default, portrait, landscape }; default is the middle of the sky
    sky: "auto", // "auto" | "blue" | "haze" | "warm" | { mode, lo, hi, sdLo, sdHi, horizon, connected }
    grade: "auto", // 0..1 darkening of non-sky pixels during the grid phase (auto: 1 blue sky, 0.6 warm, 0.3 haze)
    effectScale: 1, // multiplier on the automatic effect size (the disc is fitted into the sky)
    sharpen: "auto", // "auto" or 0..1
    textScale: 1,
    maxPixelRatio: 3,
    maxPixels: 14.7e6, // roughly 5K
    adaptive: true, // lower the render resolution if frames take too long
    fallback: "photo", // without WebGL: "photo" shows the still image, "none" leaves the box empty
    label: "Loading animation",
    onReady: null,
    onComplete: null,
    onSkip: null,
    onError: null,
    onFrame: null
  };

  function BootEffect(target, options) {
    var self = this;
    var o = (this.opts = merge(merge({}, DEFAULTS), options));

    this.frame = 0;
    this.playing = false;
    this.ready = false;
    this.finished = false;
    this._destroyed = false;
    this._raf = 0;
    this._last = -1;
    this._quality = 1;
    this._frameTimes = [];
    this._variants = {};
    this._cur = null;
    this._textKey = null;
    this.done = new Promise(function (resolve) { self._resolveDone = resolve; });

    this.target = typeof target === "string" ? document.querySelector(target) : target || document.body;
    this.layout = {};
    this.el = document.createElement("div");
    this.canvas = document.createElement("canvas");
    this.el.setAttribute("role", "img");
    this.el.setAttribute("aria-label", o.label);
    this.el.appendChild(this.canvas);
    this.target.appendChild(this.el);

    this._onLost = function (e) { e.preventDefault(); };
    this._onRestored = function () {
      try {
        self._initGL();
        self._cur = null;
        self._textKey = null;
        self._useVariant(self._pick());
        self._last = -1;
        self.renderFrame(self.frame);
      } catch (e) {
        self._fail(e);
      }
    };
    this._onVisibility = function () {
      if (document.hidden) {
        if (self.playing) { self._resumeAfterHidden = true; self.pause(); }
      } else if (self._resumeAfterHidden) {
        self._resumeAfterHidden = false;
        self.play();
      }
    };
    this._onWindowResize = function () { self._relayout(); self._scheduleResize(); };
    this._tick = function (t) { self._loop(t); };

    this.canvas.addEventListener("webglcontextlost", this._onLost);
    this.canvas.addEventListener("webglcontextrestored", this._onRestored);
    if (o.pauseWhenHidden) document.addEventListener("visibilitychange", this._onVisibility);
    window.addEventListener("resize", this._onWindowResize);
    if (typeof ResizeObserver === "function") {
      this._ro = new ResizeObserver(function () { self._scheduleResize(); });
      this._ro.observe(this.el);
    }

    this.setLayout(typeof o.layout === "object" ? o.layout : {}, true);
    this._boot();
  }

  var proto = BootEffect.prototype;
  BootEffect.VERSION = "__VERSION__";
  BootEffect.FRAMES = FRAMES;
  BootEffect.FPS = FPS;
  BootEffect.DURATION = (FRAMES / FPS) * 1000;
  BootEffect.supported = function () {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) {
      return false;
    }
  };

  Object.defineProperty(proto, "progress", {
    get: function () { return this.frame / (FRAMES - 1); }
  });

  proto._fail = function (e) {
    if (this.opts.onError) this.opts.onError(e);
    else console.error(e);
    this._showStill();
  };

  // Graceful degradation: show the photograph itself instead of an empty box.
  proto._showStill = function () {
    if (this._destroyed || this._stilled || this.opts.fallback === "none") return;
    var spec = this._spec;
    var src = spec && (spec.default || spec.landscape || spec.portrait);
    if (typeof src !== "string") return;
    this._stilled = true;
    var s = this.el.style;
    s.backgroundImage = 'url("' + src + '")';
    s.backgroundSize = this.opts.fit === "contain" ? "contain" : "cover";
    s.backgroundPosition = "50% 38%";
    s.backgroundRepeat = "no-repeat";
    this.canvas.style.display = "none";
    this._finish(false);
  };

  // --- layout ---------------------------------------------------------------------------------------

  proto.setLayout = function (patch, init) {
    var o = this.opts;
    var base = typeof o.layout === "string" ? o.layout : "inline";
    var L = this.layout;

    if (init) {
      Object.keys(L).forEach(function (k) { delete L[k]; });
      if (base === "fullscreen") Object.assign(L, { position: "fixed", top: 0, left: 0, width: "100vw", height: "100dvh", zIndex: 9999 });
      else Object.assign(L, { position: "relative", width: "100%", height: "auto" });
    }
    if (patch === "fullscreen") {
      Object.assign(L, { position: "fixed", anchor: null, top: 0, left: 0, right: null, bottom: null, width: "100vw", height: "100dvh", zIndex: 9999 });
    } else if (patch === "inline") {
      Object.assign(L, { position: "relative", anchor: null, top: null, left: null, right: null, bottom: null, width: "100%", height: "auto", zIndex: null });
    } else if (patch) {
      Object.assign(L, patch);
      if (patch.fit) o.fit = patch.fit;
    }
    this._applyLayout();
    return this;
  };

  proto._applyLayout = function () {
    var L = this.layout;
    var s = this.el.style;
    var transforms = [];

    s.position = L.position || "relative";
    s.boxSizing = "border-box";
    s.overflow = "hidden";
    s.lineHeight = "0";
    s.pointerEvents = "none";
    s.contain = "layout paint";
    s.width = cssLength(L.width);
    s.maxWidth = cssLength(L.maxWidth) || "";
    s.maxHeight = cssLength(L.maxHeight) || "";
    s.height = "";
    s.height = cssLength(L.height);
    if (L.height === "100dvh" && !(window.CSS && CSS.supports && CSS.supports("height", "100dvh"))) s.height = "100vh";
    s.zIndex = L.zIndex == null ? "" : String(L.zIndex);
    s.top = s.left = s.right = s.bottom = "";

    if (L.anchor) {
      var a = L.anchor;
      var v = a.indexOf("top") >= 0 ? "top" : a.indexOf("bottom") >= 0 ? "bottom" : "mid";
      var h = a.indexOf("left") >= 0 ? "left" : a.indexOf("right") >= 0 ? "right" : "mid";
      if (v === "top") s.top = "0";
      else if (v === "bottom") s.bottom = "0";
      else s.top = "50%";
      if (h === "left") s.left = "0";
      else if (h === "right") s.right = "0";
      else s.left = "50%";
      if (v === "mid") transforms.push("translateY(-50%)");
      if (h === "mid") transforms.push("translateX(-50%)");
    }
    ["top", "left", "right", "bottom"].forEach(function (k) {
      if (L[k] != null) s[k] = cssLength(L[k]);
    });
    if (L.transform) transforms.push(L.transform);
    s.transform = transforms.join(" ");

    var cs = this.canvas.style;
    cs.display = "block";
    cs.position = "absolute";
    cs.left = cs.top = "0";
    cs.width = "100%";
    cs.height = "100%";
    this._relayout();
    this._scheduleResize();
  };

  // Aspect ratio for height:"auto" boxes, re-evaluated on orientation change.
  proto._relayout = function () {
    var L = this.layout;
    var a = this.opts.aspect;
    var ratio = "";
    if (L.height === "auto" || L.height == null) {
      if (a === "auto") ratio = window.innerWidth >= window.innerHeight ? "16 / 9" : "9 / 16";
      else if (typeof a === "number") ratio = String(a);
      else ratio = String(a).replace("/", " / ");
    }
    this.el.style.aspectRatio = ratio;
  };

  proto.setPosition = function (patch) { return this.setLayout(patch); };
  proto.setSize = function (width, height) { return this.setLayout({ width: width, height: height == null ? "auto" : height }); };
  proto.setOptions = function (patch) {
    merge(this.opts, patch);
    if (patch && "aspect" in patch) this._relayout();
    this._scheduleResize(true);
    return this;
  };

  // --- sizing ---------------------------------------------------------------------------------------

  proto._scheduleResize = function (force) {
    var self = this;
    if (force) this._forceSize = true;
    if (this._pendingResize) return;
    this._pendingResize = requestAnimationFrame(function () {
      self._pendingResize = 0;
      self._applySize();
    });
  };

  proto._pixelRatio = function (cw, ch) {
    var pr = Math.min(window.devicePixelRatio || 1, this.opts.maxPixelRatio) * this._quality;
    var px = cw * ch * pr * pr;
    if (px > this.opts.maxPixels) pr *= Math.sqrt(this.opts.maxPixels / px);
    return Math.max(0.25, pr);
  };

  proto._applySize = function () {
    if (this._destroyed || !this.gl) return;
    if (!this.el.clientWidth || !this.el.clientHeight) return;
    var cw = this.el.clientWidth;
    var ch = this.el.clientHeight;
    var pr = this._pixelRatio(cw, ch);
    var W = Math.max(1, Math.round(cw * pr));
    var H = Math.max(1, Math.round(ch * pr));
    var changed = W !== this.canvas.width || H !== this.canvas.height;

    if (changed) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.gl.viewport(0, 0, W, H);
      this._textKey = null;
    }
    this.size = { cssWidth: cw, cssHeight: ch, width: W, height: H, pixelRatio: pr };

    var variant = this._pick();
    if (variant !== this._cur) this._useVariant(variant);
    if (changed || this._forceSize) {
      this._forceSize = false;
      this._last = -1;
      this.renderFrame(this.frame);
    }
  };

  // --- photo variants -------------------------------------------------------------------------------

  proto._boot = function () {
    var self = this;
    var o = this.opts;
    var photo = o.photo;
    var spec;

    if (photo == null) {
      this._fail(new Error("BootEffect: options.photo is required"));
      return;
    }
    var single = typeof photo === "string" || photo.width || photo.naturalWidth;
    spec = single ? { default: photo } : photo;
    this._spec = spec;

    var jobs = [];
    ["default", "portrait", "landscape"].forEach(function (key) {
      if (spec[key] == null) return;
      jobs.push(loadImage(spec[key]).then(function (img) {
        self._variants[key] = { key: key, img: img, size: dims(img) };
      }));
    });

    Promise.all(jobs)
      .then(function () {
        if (self._destroyed) return;
        if (!Object.keys(self._variants).length) throw new Error("BootEffect: no photo");
        self._initGL();
        self.ready = true;
        self._applySize();
        if (o.onReady) o.onReady(self);

        var reduceMotion = o.respectReducedMotion && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
        self.renderFrame(self.frame);
        if (o.autoplay || self._wantPlay) {
          if (reduceMotion) {
            if (o.onSkip) o.onSkip();
            self._finish(false);
          } else {
            self.play();
          }
        }
      })
      .catch(function (e) { self._fail(e); });
  };

  proto._pick = function () {
    var V = this._variants;
    var landscape = this.canvas.width >= this.canvas.height;
    return (landscape ? V.landscape || V.default || V.portrait : V.portrait || V.default || V.landscape) || null;
  };

  // --- WebGL ----------------------------------------------------------------------------------------

  proto._initGL = function () {
    var gl = (this.gl =
      this.canvas.getContext("webgl", {
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false
      }) || this.canvas.getContext("experimental-webgl"));
    if (!gl) throw new Error("BootEffect: WebGL is not available");

    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }

    var program = (this.prog = gl.createProgram());
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    var u = (this.u = {});
    [
      "uPhoto", "uAux", "uText", "uView", "uPhotoSize", "uCentre", "uRect", "uGlow", "uSkyColour", "uReach", "uInkScale", "uScale",
      "uSharpen", "uChromaShift", "uGrade", "uGlowRings", "uMode", "uFrame", "uDiscRadius", "uDiscFill", "uOuterRings", "uDialogReveal", "uDialogFade", "uThreshold", "uSparks", "uTextVisible"
    ].forEach(function (name) {
      u[name] = gl.getUniformLocation(program, name);
    });
    gl.uniform1i(u.uPhoto, 0);
    gl.uniform1i(u.uAux, 1);
    gl.uniform1i(u.uText, 2);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

    this._textTexture = this._createTexture(2);
    this._textCanvas = this._textCanvas || document.createElement("canvas");

    // Textures belong to the (new) context: forget the old handles.
    var key, j, variant;
    for (key in this._variants) {
      variant = this._variants[key];
      variant.auxTexture = null;
      if (variant.levels) for (j = 0; j < variant.levels.length; j++) variant.levels[j].texture = null;
    }
    this._level = null;
  };

  proto._createTexture = function (unit, data) {
    var gl = this.gl;
    var texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return texture;
  };

  proto._useVariant = function (v) {
    if (!v) return;
    var gl = this.gl;

    // Photo pyramid: level 0 is the full photo, every further level a 2x box-filtered copy.
    if (!v.levels) {
      var maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var source = v.img, tw = v.size[0], th = v.size[1];
      if (Math.max(tw, th) > maxTexture) {
        var k = maxTexture / Math.max(tw, th);
        var c = document.createElement("canvas");
        c.width = Math.round(tw * k);
        c.height = Math.round(th * k);
        var cx = c.getContext("2d");
        cx.imageSmoothingQuality = "high";
        cx.drawImage(v.img, 0, 0, c.width, c.height);
        source = c;
        tw = c.width;
        th = c.height;
      }
      v.levels = [{ w: tw, h: th, source: source, texture: null }];
    }

    if (!v.aux) {
      v.aux = analysePhoto(v.img, v.size[0], v.size[1], this.opts.sky);
      v.autoScale = clamp((0.48 * v.aux.stats.radius) / (67.5 / REF_WIDTH), 0.35, 1.15);
    }
    if (!v.auxTexture) v.auxTexture = this._createTexture(1, v.aux.data);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, v.auxTexture);
    var st = v.aux.stats;
    gl.uniform3f(this.u.uSkyColour, st.skyColour[0], st.skyColour[1], st.skyColour[2]);
    gl.uniform1f(this.u.uInkScale, st.inkScale);
    this._cur = v;
    this._level = null;
    this._last = -1;
  };

  // Smallest pyramid level that still carries at least 80% of the device pixels it will cover.
  proto._levelFor = function (v, neededWidth) {
    var L = v.levels;
    var k = neededWidth > 0 ? Math.floor(Math.log(L[0].w / (neededWidth * 0.8)) / Math.LN2) : 0;
    var j, prev, c, cx;
    k = clamp(k, 0, 6);

    for (j = L.length; j <= k; j++) {
      prev = L[j - 1];
      c = document.createElement("canvas");
      c.width = Math.round(prev.w / 2);
      c.height = Math.round(prev.h / 2);
      if (c.width < 48 || c.height < 48) break;
      cx = c.getContext("2d");
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = "high";
      cx.drawImage(prev.source, 0, 0, c.width, c.height);
      L[j] = { w: c.width, h: c.height, source: c, texture: null };
    }
    var level = L[Math.min(k, L.length - 1)];
    if (!level.texture) level.texture = this._createTexture(0, level.source);
    return level;
  };

  // --- geometry -------------------------------------------------------------------------------------

  proto._focusPoint = function (aspect, v) {
    var focus = this.opts.focus;
    if (!focus) {
      var c = this._centreUV(v);
      return [c[0], clamp(c[1] + 0.12, 0.15, 0.5)]; // keep the sky and the disc in frame
    }
    var f = Object.assign({}, DEFAULT_FOCUS, focus);
    var t = clamp((aspect - 9 / 16) / (16 / 9 - 9 / 16), 0, 1);
    return [f.portrait[0] + (f.landscape[0] - f.portrait[0]) * t, f.portrait[1] + (f.landscape[1] - f.portrait[1]) * t];
  };

  // Where the photo lands in the canvas: [x, y, width, height] in device pixels.
  proto._photoRect = function (cw, ch, v) {
    var pw = v.size[0], ph = v.size[1], fit = this.opts.fit;
    if (fit === "fill") return [0, 0, cw, ch];

    var scale = fit === "contain" ? Math.min(cw / pw, ch / ph) : Math.max(cw / pw, ch / ph);
    var w = pw * scale, h = ph * scale;
    if (fit === "contain") return [(cw - w) / 2, (ch - h) / 2, w, h];

    var f = this._focusPoint(cw / ch, v);
    return [clamp(cw / 2 - f[0] * w, cw - w, 0), clamp(ch / 2 - f[1] * h, ch - h, 0), w, h];
  };

  proto._centreUV = function (v) {
    var c = this.opts.center;
    if (c && !Array.isArray(c)) c = (v.key === "landscape" ? c.landscape : c.portrait) || c.default;
    return c || v.aux.stats.centre;
  };

  // --- stop-screen text layer, drawn at device resolution -------------------------------------------

  proto._drawText = function (typed, W, H) {
    var c = this._textCanvas;
    var cell = (Math.min(W, H) / 47.06) * this.opts.textScale;
    var pitch = cell * 1.026;
    var x0 = cell * 0.523;
    var y0 = cell * 1.307;
    var whole = Math.floor(typed);
    var last = Math.min(LINES.length - 1, whole);
    var part = Math.round((typed - whole) * 48);
    var scroll = Math.max(0, y0 + pitch * last + pitch * 0.6 - H);
    var key = whole + ":" + part + ":" + W + "x" + H + ":" + Math.round(scroll) + ":" + cell.toFixed(2);

    if (key === this._textKey) return false;
    this._textKey = key;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }

    var x = c.getContext("2d");
    x.clearRect(0, 0, W, H);
    x.font = "bold " + pitch * 0.955 + 'px "Lucida Console","DejaVu Sans Mono",Consolas,"Courier New",monospace';
    x.textBaseline = "middle";
    x.fillStyle = "#fff";
    var sx = cell / x.measureText("M").width;
    x.save();
    x.scale(sx, 1);
    for (var i = 0; i <= last; i++) {
      var line = LINES[i];
      var y = y0 + pitch * i - scroll;
      if (y < -pitch || y > H + pitch) continue;
      if (i === whole) line = line.slice(0, part);
      if (line) x.fillText(line, x0 / sx, y);
    }
    x.restore();
    return true;
  };

  // --- rendering ------------------------------------------------------------------------------------

  proto.renderFrame = function (frame) {
    var gl = this.gl, v = this._cur;
    if (!this.ready || !gl || !v || !this.size) return;

    var u = this.u;
    var s = frameState(frame);
    var W = this.canvas.width, H = this.canvas.height;
    var rect = this._photoRect(W, H, v);
    var scale = (rect[2] / REF_WIDTH) * this.opts.effectScale * v.autoScale;
    var centre = this._centreUV(v);
    var stats = v.aux.stats;

    var gradeAmount = this.opts.grade === "auto" ? { blue: 1, warm: 0.6 }[stats.mode] || 0.3 : +this.opts.grade || 0;
    var level = this._levelFor(v, rect[2]);
    if (level !== this._level) {
      this._level = level;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, level.texture);
      gl.uniform2f(u.uPhotoSize, level.w, level.h);
    }
    var sharpen = this.opts.sharpen === "auto" ? clamp(0.22 * (rect[2] / level.w - 1), 0, 0.55) : +this.opts.sharpen || 0;

    gl.uniform2f(u.uView, W, H);
    gl.uniform4f(u.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(u.uScale, scale);
    gl.uniform1f(u.uSharpen, sharpen);
    gl.uniform1f(u.uMode, s.mode);
    gl.uniform1f(u.uFrame, s.f);
    gl.uniform1f(u.uThreshold, s.mode === THRESHOLD ? stats.thresholdLuma : s.thr);
    gl.uniform1f(u.uChromaShift, s.mode === GRID ? 1.5 : 0);
    gl.uniform1f(u.uGrade, s.mode === GRID ? smooth(16, 30, s.f) * gradeAmount : 0);

    if (s.mode === GRID) {
      gl.uniform2f(u.uCentre, (centre[0] * rect[2]) / scale, (centre[1] * rect[3]) / scale);
      gl.uniform1f(u.uDiscRadius, s.R);
      gl.uniform1f(u.uDiscFill, s.disc);
      gl.uniform1f(u.uOuterRings, s.macro);
      gl.uniform1f(u.uReach, (Math.max(stats.reach, 0.05) * rect[2]) / scale);
      gl.uniform1f(u.uDialogReveal, s.reveal);
      gl.uniform1f(u.uDialogFade, s.fade);
      gl.uniform1f(u.uSparks, s.dots);
      gl.uniform4f(u.uGlow, s.tint[0], s.tint[1], s.tint[2], s.tint[3]);
      gl.uniform1f(u.uGlowRings, s.tint[4]);
    } else {
      gl.uniform4f(u.uGlow, 0, 0, 0, 0);
      gl.uniform1f(u.uSparks, 0);
      gl.uniform1f(u.uDialogReveal, 0);
    }

    var hasText = s.typed >= 0;
    gl.uniform1f(u.uTextVisible, hasText ? 1 : 0);
    if (hasText) {
      var changed = this._drawText(s.typed, W, H);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this._textTexture);
      if (changed) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._textCanvas);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (this.opts.onFrame) this.opts.onFrame(s.f);
  };

  // --- playback -------------------------------------------------------------------------------------

  proto.seek = function (frame) {
    this.frame = clamp(frame | 0, 0, FRAMES - 1);
    this._last = this.frame;
    this.renderFrame(this.frame);
    return this;
  };

  proto.seekTime = function (ms) {
    return this.seek(Math.floor((ms * FPS) / 1000));
  };

  proto.play = function () {
    if (this._destroyed) return this;
    if (!this.ready) {
      this._wantPlay = true;
      return this;
    }
    if (this.frame >= FRAMES - 1) this.frame = 0;
    this.finished = false;
    this.playing = true;
    this._t0 = null;
    this._base = this.frame;
    this.el.style.visibility = "visible";
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._tick);
    return this;
  };

  proto.pause = function () {
    this.playing = false;
    cancelAnimationFrame(this._raf);
    return this;
  };

  proto.stop = function () {
    this.pause();
    return this.seek(0);
  };

  proto.restart = function () {
    this.frame = 0;
    this._last = -1;
    return this.play();
  };

  proto.skip = function () {
    this.pause();
    this.seek(FRAMES - 1);
    this._finish(true);
    return this;
  };

  proto._finish = function (notify) {
    this.playing = false;
    this.finished = true;
    if (this.opts.hideOnComplete) this.el.style.visibility = "hidden";
    if (notify && this.opts.onComplete) this.opts.onComplete(this);
    if (this._resolveDone) this._resolveDone(this);
  };

  // Lowers the pixel ratio if the display cannot keep up (average frame time above 30ms over 24 frames).
  proto._govern = function (now) {
    if (!this.opts.adaptive) return;
    if (this._prevTime) {
      this._frameTimes.push(now - this._prevTime);
      if (this._frameTimes.length > 24) this._frameTimes.shift();
    }
    this._prevTime = now;
    if (this._frameTimes.length === 24 && this._quality > 0.55) {
      var avg = this._frameTimes.reduce(function (a, b) { return a + b; }, 0) / 24;
      if (avg > 30) {
        this._quality = Math.max(0.55, this._quality * 0.8);
        this._frameTimes.length = 0;
        this._scheduleResize(true);
      }
    }
  };

  proto._loop = function (now) {
    if (!this.playing || this._destroyed) return;
    if (this._t0 == null) this._t0 = now;
    this._govern(now);

    var f = this._base + Math.floor(((now - this._t0) * this.opts.speed * FPS) / 1000);
    if (f >= FRAMES) {
      if (this.opts.loop) {
        this._t0 = now;
        this._base = 0;
        f = 0;
      } else {
        this.frame = FRAMES - 1;
        this.renderFrame(this.frame);
        this._finish(true);
        return;
      }
    }
    if (f !== this._last) {
      this._last = f;
      this.frame = f;
      this.renderFrame(f);
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  // What the sky analysis found in the photo currently in use.
  // mask is an ImageData: R = sky (0..255), G = luma, B = local contrast.
  proto.analysis = function () {
    var v = this._cur;
    if (!v) return null;
    var s = v.aux.stats;
    return { mode: s.mode, centre: s.centre.slice(), radius: s.radius, reach: s.reach, skyColour: s.skyColour.slice(), mask: v.aux.data };
  };

  proto.snapshot = function (type, quality) {
    this._last = -1;
    this.renderFrame(this.frame);
    return this.canvas.toDataURL(type || "image/png", quality);
  };

  proto.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    this.pause();
    cancelAnimationFrame(this._pendingResize);
    if (this._ro) this._ro.disconnect();
    document.removeEventListener("visibilitychange", this._onVisibility);
    window.removeEventListener("resize", this._onWindowResize);
    this.canvas.removeEventListener("webglcontextlost", this._onLost);
    this.canvas.removeEventListener("webglcontextrestored", this._onRestored);

    var gl = this.gl;
    if (gl) {
      var self = this;
      Object.keys(this._variants).forEach(function (key) {
        var v = self._variants[key];
        if (v.levels) v.levels.forEach(function (l) { if (l.texture) gl.deleteTexture(l.texture); });
        if (v.auxTexture) gl.deleteTexture(v.auxTexture);
      });
      if (this._textTexture) gl.deleteTexture(this._textTexture);
      if (this.prog) gl.deleteProgram(this.prog);
      var lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.gl = null;
    if (this._resolveDone) this._resolveDone(this);
  };

  return BootEffect;
});
