function printDocument(targetId?: string) {
  const body = document.body;
  const target = targetId ? document.getElementById(targetId) : null;
  const cleanup = () => {
    body.classList.remove("is-printing", "is-targeted-print");
    target?.classList.remove("active-print-area");
  };
  body.classList.add("is-printing");
  if (target) {
    body.classList.add("is-targeted-print");
    target.classList.add("active-print-area");
  }
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1200);
}

export const printCurrentDocument = () => printDocument();
export const printDocumentById = (targetId: string) => printDocument(targetId);
