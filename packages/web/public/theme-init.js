// Apply the OS color scheme to <html> before first paint (no flash) and keep
// it in sync when the user flips their system theme. External file (not
// inline): the production CSP allows script-src 'self' only — see icon-scheme.js.
(function () {
  var mq = matchMedia("(prefers-color-scheme: dark)");
  var apply = function (dark) {
    document.documentElement.classList.toggle("dark", dark);
  };
  apply(mq.matches);
  mq.addEventListener("change", function (e) {
    apply(e.matches);
  });
})();
