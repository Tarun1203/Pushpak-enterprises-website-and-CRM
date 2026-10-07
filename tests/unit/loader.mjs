// Maps the Firebase CDN imports used by crm/*.js to the local stubs.
const CDN = /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+)\.js$/;
export async function resolve(specifier, context, next) {
  const m = CDN.exec(specifier);
  if (m) return { url: new URL(`./stubs/${m[1]}.mjs`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
