// Behaviour shared by every page: header state, copy buttons, table-of-contents highlighting.
(function () {
  var header = document.querySelector(".site-header");
  if (header && header.dataset.hero !== undefined) {
    var onScroll = function () {
      var past = window.scrollY > window.innerHeight * 0.6;
      header.classList.toggle("on-hero", !past);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  document.querySelectorAll(".code").forEach(function (block) {
    var pre = block.querySelector("pre");
    if (!pre || block.dataset.nocopy !== undefined) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = "Copy";
    button.addEventListener("click", function () {
      var done = function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1400);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(pre.innerText).then(done);
    });
    block.appendChild(button);
  });

  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var visible = {};
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
        var first = Object.keys(byId).filter(function (id) { return visible[id]; })[0];
        if (first) links.forEach(function (a) { a.classList.toggle("active", a === byId[first]); });
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
})();
