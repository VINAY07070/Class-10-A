/* Simple iconic stickmen: two lightweight SVG mascots that stay on the floor. */
(function () {
  'use strict';
  if (window.StickMen) return;

  var stage, figures = [], frameId = 0, last = 0, nextAction = 0;
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function makeFigure(name, color, x) {
    var element = document.createElement('button');
    element.type = 'button';
    element.className = 'simple-stickman';
    element.setAttribute('aria-label', name + ' stickman');
    element.innerHTML = '<span class="simple-stickman-name">' + name + '</span>' +
      '<svg viewBox="0 0 48 72" aria-hidden="true" focusable="false">' +
      '<circle cx="24" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="3"/>' +
      '<path d="M24 21v24M24 27L12 38M24 27l12 11M24 45L14 62M24 45l10 17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    element.style.color = color;
    stage.appendChild(element);
    var figure = { el: element, x: x, target: x, direction: 1, phase: Math.random() * 6.28 };
    element.addEventListener('click', function () {
      element.classList.remove('simple-stickman-pop');
      void element.offsetWidth;
      element.classList.add('simple-stickman-pop');
    });
    return figure;
  }
  function resize() {
    figures.forEach(function (figure) {
      figure.x = clamp(figure.x, 8, Math.max(8, window.innerWidth - 56));
      figure.target = clamp(figure.target, 8, Math.max(8, window.innerWidth - 56));
    });
  }
  function chooseTargets(now) {
    if (now < nextAction || reduced) return;
    nextAction = now + 6000 + Math.random() * 7000;
    figures.forEach(function (figure) {
      figure.direction = Math.random() > .5 ? 1 : -1;
      figure.target = clamp(figure.x + figure.direction * (50 + Math.random() * 130), 8, window.innerWidth - 56);
    });
  }
  function render(now) {
    var dt = Math.min(40, now - last || 16);
    last = now;
    chooseTargets(now);
    figures.forEach(function (figure, index) {
      var delta = figure.target - figure.x;
      if (!reduced && Math.abs(delta) > 1) figure.x += Math.sign(delta) * Math.min(Math.abs(delta), dt * .055);
      var walking = Math.abs(delta) > 1 && !reduced;
      figure.phase += dt * .012;
      figure.el.style.left = figure.x.toFixed(1) + 'px';
      figure.el.style.setProperty('--step', walking ? (Math.sin(figure.phase) * 2.2).toFixed(2) + 'px' : '0px');
      figure.el.style.setProperty('--delay', (index * .18) + 's');
      figure.el.classList.toggle('is-walking', walking);
      figure.el.style.transform = 'translateY(' + (walking ? Math.abs(Math.sin(figure.phase)) * -1.5 : 0).toFixed(2) + 'px)';
    });
    if (!reduced) frameId = requestAnimationFrame(render);
  }
  function init() {
    if (stage) return;
    stage = document.createElement('div');
    stage.className = 'simple-stickmen-stage';
    stage.setAttribute('aria-label', 'Class mascots');
    document.body.appendChild(stage);
    figures = [makeFigure('Vinay', '#8b7cff', 24), makeFigure('Nitin', '#35d6ba', Math.max(100, window.innerWidth - 120))];
    resize();
    window.addEventListener('resize', resize, { passive: true });
    nextAction = performance.now() + 2500;
    render(performance.now());
  }
  function destroy() { cancelAnimationFrame(frameId); if (stage) stage.remove(); stage = null; figures = []; }
  window.StickMen = { init: init, destroy: destroy };
})();