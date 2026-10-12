// Playground: live controls over one BootEffect instance. State lives in the URL, so any view can be linked.
(function () {
  var LAKE = "assets/lake.jpg";
  var LAKE_SKY = { mode: "warm", horizon: 0.49 };
  var LAST = BootEffect.FRAMES - 1;
  var SHAPES = { wide: "16 / 9", phone: "9 / 16", square: "1 / 1" };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    stage: $("stage"), play: $("play"), scrub: $("scrub"), time: $("time"), speed: $("speed"), loop: $("loop"),
    fit: $("fit"), scale: $("scale"), text: $("text"), grade: $("grade"), sky: $("sky"), horizon: $("horizon"),
    file: $("file"), lake: $("lake"), snap: $("snap"), share: $("share"), snippet: $("snippet"), phases: $("phases"),
    note: $("support-note")
  };

  if (!BootEffect.supported()) {
    el.note.style.display = "block";
    return;
  }

  var params = new URLSearchParams(location.search);
  var state = {
    frame: params.has("frame") ? Math.min(LAST, Math.max(0, parseInt(params.get("frame"), 10) || 0)) : null,
    shape: SHAPES[params.get("shape")] ? params.get("shape") : "wide",
    fit: params.get("fit") || "cover",
    scale: parseFloat(params.get("scale")) || 1,
    text: parseFloat(params.get("text")) || 1,
    speed: parseFloat(params.get("speed")) || 1,
    loop: params.get("loop") === "1",
    grade: params.get("grade") || "auto",
    sky: params.get("sky") || "warm",
    horizon: params.has("horizon") ? parseFloat(params.get("horizon")) : 0.49
  };
  var photo = { url: LAKE, name: "lake.jpg", custom: false };
  var fx = null;

  function two(n) { return n.toFixed(2); }
  function pad(n) { return ("00" + n).slice(-3); }

  function skyOption() {
    if (state.sky === "auto" && state.horizon >= 1) return "auto";
    var sky = { mode: state.sky };
    if (state.horizon < 1) sky.horizon = state.horizon;
    return sky;
  }

  function gradeOption() {
    return state.grade === "auto" ? "auto" : parseFloat(state.grade);
  }

  function refreshReadout() {
    var a = fx && fx.analysis();
    if (!a) return;
    $("r-mode").textContent = a.mode;
    $("r-centre").textContent = two(a.centre[0]) + ", " + two(a.centre[1]);
    $("r-radius").textContent = (a.radius * 100).toFixed(1) + "% of width";
    $("r-reach").textContent = (a.reach * 100).toFixed(0) + "% of width";
  }

  function refreshTransport() {
    var f = fx ? fx.frame : 0;
    el.scrub.value = f;
    el.time.textContent = pad(f) + " / " + LAST;
    el.play.textContent = fx && fx.playing ? "Pause" : f >= LAST ? "Replay" : "Play";
  }

  function mount(startFrame, autoplay) {
    if (fx) fx.destroy();
    el.stage.style.aspectRatio = SHAPES[state.shape];
    el.stage.dataset.shape = state.shape;
    fx = new BootEffect(el.stage, {
      photo: photo.url,
      sky: skyOption(),
      fit: state.fit,
      effectScale: state.scale,
      textScale: state.text,
      speed: state.speed,
      loop: state.loop,
      grade: gradeOption(),
      autoplay: false,
      respectReducedMotion: false,
      layout: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
      label: "Boot effect preview",
      onFrame: refreshTransport,
      onComplete: refreshTransport,
      onError: function () { el.note.style.display = "block"; },
      onReady: function (instance) {
        refreshReadout();
        if (startFrame != null) instance.seek(startFrame);
        if (autoplay) instance.play();
        refreshTransport();
        snippet();
        syncUrl();
      }
    });
  }

  // The options that differ from the library defaults, ready to paste.
  function snippet() {
    var lines = ['  photo: "' + (photo.custom ? photo.name : "lake.jpg") + '"'];
    var sky = skyOption();
    if (sky !== "auto") lines.push("  sky: " + (typeof sky === "string" ? '"' + sky + '"' : "{ mode: \"" + sky.mode + "\"" + (sky.horizon != null ? ", horizon: " + sky.horizon : "") + " }"));
    if (state.fit !== "cover") lines.push('  fit: "' + state.fit + '"');
    if (state.scale !== 1) lines.push("  effectScale: " + state.scale);
    if (state.text !== 1) lines.push("  textScale: " + state.text);
    if (state.grade !== "auto") lines.push("  grade: " + state.grade);
    if (state.speed !== 1) lines.push("  speed: " + state.speed);
    if (state.loop) lines.push("  loop: true");
    el.snippet.textContent = 'new BootEffect("#intro", {\n' + lines.join(",\n") + "\n});";
  }

  function syncUrl() {
    var q = new URLSearchParams();
    if (state.shape !== "wide") q.set("shape", state.shape);
    if (state.fit !== "cover") q.set("fit", state.fit);
    if (state.scale !== 1) q.set("scale", state.scale);
    if (state.text !== 1) q.set("text", state.text);
    if (state.speed !== 1) q.set("speed", state.speed);
    if (state.loop) q.set("loop", "1");
    if (state.grade !== "auto") q.set("grade", state.grade);
    if (!photo.custom) {
      if (state.sky !== "warm") q.set("sky", state.sky);
      if (state.horizon !== 0.49) q.set("horizon", state.horizon);
    }
    if (fx && !fx.playing) q.set("frame", fx.frame);
    var qs = q.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  // Controls that can change on the fly.
  function applyLive() {
    fx.setOptions({ fit: state.fit, effectScale: state.scale, textScale: state.text, speed: state.speed, loop: state.loop, grade: gradeOption() });
    snippet();
    syncUrl();
  }

  function bindRange(input, outputId, key, format) {
    var out = $(outputId);
    input.addEventListener("input", function () {
      state[key] = parseFloat(input.value);
      out.textContent = format(state[key]);
      applyLive();
    });
  }

  // initial control values
  el.fit.value = state.fit;
  el.speed.value = state.speed;
  el.scale.value = state.scale;
  el.text.value = state.text;
  el.grade.value = state.grade;
  el.sky.value = state.sky;
  el.horizon.value = state.horizon;
  el.loop.checked = state.loop;
  $("o-speed").textContent = state.speed + "x";
  $("o-scale").textContent = two(state.scale);
  $("o-text").textContent = two(state.text);
  $("o-horizon").textContent = two(state.horizon);
  Array.prototype.forEach.call(document.querySelectorAll("#shape button"), function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.shape === state.shape));
  });

  bindRange(el.speed, "o-speed", "speed", function (v) { return v + "x"; });
  bindRange(el.scale, "o-scale", "scale", two);
  bindRange(el.text, "o-text", "text", two);
  el.fit.addEventListener("change", function () { state.fit = el.fit.value; applyLive(); });
  el.grade.addEventListener("change", function () { state.grade = el.grade.value; applyLive(); });
  el.loop.addEventListener("change", function () { state.loop = el.loop.checked; applyLive(); });

  // Sky changes need a fresh analysis, so the instance is rebuilt on the same frame.
  function remount() {
    var playing = fx.playing, frame = fx.frame;
    mount(frame, playing);
  }
  el.sky.addEventListener("change", function () { state.sky = el.sky.value; remount(); });
  el.horizon.addEventListener("input", function () {
    state.horizon = parseFloat(el.horizon.value);
    $("o-horizon").textContent = two(state.horizon);
  });
  el.horizon.addEventListener("change", remount);

  document.getElementById("shape").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    state.shape = b.dataset.shape;
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", String(x === b));
    });
    var playing = fx.playing, frame = fx.frame;
    mount(frame, playing);
  });

  // transport
  el.play.addEventListener("click", function () {
    if (fx.playing) fx.pause();
    else if (fx.frame >= LAST) fx.restart();
    else fx.play();
    refreshTransport();
    syncUrl();
  });
  el.scrub.addEventListener("input", function () {
    fx.pause();
    fx.seek(parseInt(el.scrub.value, 10));
  });
  el.scrub.addEventListener("change", syncUrl);
  el.phases.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    fx.pause();
    fx.seek(parseInt(b.dataset.frame, 10));
    syncUrl();
  });
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" && e.target.type !== "range" || tag === "select" || tag === "textarea") return;
    if (e.key === " " && tag !== "button") {
      e.preventDefault();
      el.play.click();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (tag === "input") return;
      e.preventDefault();
      fx.pause();
      fx.seek(fx.frame + (e.key === "ArrowRight" ? 1 : -1));
      syncUrl();
    }
  });

  // photograph
  el.file.addEventListener("change", function () {
    var file = el.file.files && el.file.files[0];
    if (!file) return;
    if (photo.custom) URL.revokeObjectURL(photo.url);
    photo = { url: URL.createObjectURL(file), name: file.name, custom: true };
    state.sky = "auto";
    state.horizon = 1;
    el.sky.value = "auto";
    el.horizon.value = 1;
    $("o-horizon").textContent = "1.00";
    el.lake.hidden = false;
    mount(0, true);
  });
  el.lake.addEventListener("click", function () {
    if (photo.custom) URL.revokeObjectURL(photo.url);
    photo = { url: LAKE, name: "lake.jpg", custom: false };
    state.sky = "warm";
    state.horizon = 0.49;
    el.sky.value = "warm";
    el.horizon.value = 0.49;
    $("o-horizon").textContent = "0.49";
    el.lake.hidden = true;
    mount(0, true);
  });

  // output
  el.snap.addEventListener("click", function () {
    var a = document.createElement("a");
    a.href = fx.snapshot("image/png");
    a.download = "boot-effect-frame-" + pad(fx.frame) + ".png";
    a.click();
  });
  el.share.addEventListener("click", function () {
    var done = function () {
      el.share.textContent = "Link copied";
      setTimeout(function () { el.share.textContent = "Copy link to this state"; }, 1500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done);
  });

  mount(state.frame, state.frame == null);
})();
