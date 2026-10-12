// Landing page: the hero is the effect itself, running on the lake photograph.
(function () {
  var stage = document.getElementById("hero-stage");
  var counter = document.getElementById("hero-frame");
  var replay = document.getElementById("hero-replay");
  if (!stage || typeof BootEffect === "undefined") return;

  var fx;
  var restTimer;

  function pad(n) {
    return ("00" + n).slice(-3);
  }

  fx = new BootEffect(stage, {
    photo: "assets/lake.jpg",
    sky: { mode: "warm", horizon: 0.49 },
    autoplay: false,
    layout: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
    label: "Sunset over a forest lake. The sky turns into graph paper, then the screen crashes to blue.",
    onFrame: function (f) {
      if (counter) counter.textContent = pad(f);
    },
    onComplete: function () {
      clearTimeout(restTimer);
      restTimer = setTimeout(function () {
        fx.stop();
        if (replay) replay.disabled = false;
      }, 1600);
    },
    onReady: function () {
      setTimeout(function () { fx.play(); }, 900);
    }
  });

  if (replay) {
    replay.addEventListener("click", function () {
      clearTimeout(restTimer);
      fx.restart();
    });
  }
})();
