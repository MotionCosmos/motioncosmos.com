// The small Lottie animations next to "Zo werkt het" / "How it works".
// They start one after another when the steps scroll into view, loop while visible and pause
// when not. With reduced motion, each shows its finished frame and stays still.
(function () {
  var tiles = document.querySelectorAll('[data-lottie]');
  if (!tiles.length || !window.lottie) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var anims = [];
  tiles.forEach(function (el, i) {
    var anim = window.lottie.loadAnimation({
      container: el, renderer: 'svg', loop: !reduce, autoplay: false, path: el.getAttribute('data-lottie'),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
    });
    anim.addEventListener('DOMLoaded', function () { anim.goToAndStop(reduce ? 90 : 0, true); });
    anims.push(anim);
  });
  if (reduce) return;
  var started = false;
  function start() {
    if (started) { anims.forEach(function (a) { a.play(); }); return; }
    started = true;
    anims.forEach(function (a, i) { setTimeout(function () { a.play(); }, i * 700); });
  }
  function stop() { anims.forEach(function (a) { a.pause(); }); }
  var section = tiles[0].closest('ol') || tiles[0];
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
    }, { threshold: 0.2 }).observe(section);
  } else {
    start();
  }
})();
