export function printCurrentDocument() {
  const body = document.body;
  const cleanup = () => body.classList.remove("is-printing");
  body.classList.add("is-printing");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1200);
}
