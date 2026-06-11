// iOS has no native dark-mode icon support for web apps, but "Add to Home
// Screen" reads the live DOM — give dark-mode users the dark icon up front.
// External file (not inline in index.html): the production CSP (Caddyfile)
// allows script-src 'self' only, so inline scripts never execute there.
// Replace the <link> element instead of mutating its href: Safari registers
// touch icons when the element is inserted, not on attribute changes.
if (matchMedia("(prefers-color-scheme: dark)").matches) {
  const light = document.querySelector('link[rel="apple-touch-icon"]');
  const dark = document.createElement("link");
  dark.rel = "apple-touch-icon";
  dark.href = "/apple-touch-icon-dark.png";
  light.replaceWith(dark);
}
