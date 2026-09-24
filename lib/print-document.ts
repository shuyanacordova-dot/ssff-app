// Print only a snapshot of the requested document, never the surrounding app/modal.
let printing = false;

function waitForAsset(element: HTMLLinkElement | HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      element.removeEventListener("load", finish);
      element.removeEventListener("error", finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, 15000);
    element.addEventListener("load", finish, { once: true });
    element.addEventListener("error", finish, { once: true });
    if (element instanceof HTMLImageElement && element.complete) finish();
  });
}

async function printDocument(target: HTMLElement | null) {
  if (!target || printing) return;
  printing = true;
  const frame = document.createElement("iframe");
  frame.title = "Documento para imprimir";
  frame.setAttribute("aria-hidden", "true");
  // Keep a real layout viewport (not display:none) for styles and image loading.
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;pointer-events:none";
  let cleanupTimer: number | undefined;
  const cleanup = () => {
    window.clearTimeout(cleanupTimer);
    frame.remove();
    printing = false;
  };
  try {
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!doc || !printWindow) throw new Error("No se pudo preparar la impresión.");
    doc.open();
    doc.write("<!doctype html><html lang='es'><head></head><body class='print-context'></body></html>");
    doc.close();
    doc.title = document.title;
    const base = doc.createElement("base");
    base.href = document.baseURI;
    doc.head.appendChild(base);
    const assets: Promise<void>[] = [];
    document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      const copy = node.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
      if (copy instanceof HTMLLinkElement) assets.push(waitForAsset(copy));
      doc.head.appendChild(copy);
    });
    const copy = target.cloneNode(true) as HTMLElement;
    // Snapshot current values as text, including uncontrolled inputs/textareas.
    const controls = target.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
    copy.querySelectorAll("input, textarea, select").forEach((control, index) => {
      const source = controls[index];
      const text = doc.createElement("span");
      text.className = "print-field-value";
      text.textContent = source instanceof HTMLSelectElement
        ? Array.from(source.selectedOptions, (option) => option.text).join(", ")
        : source instanceof HTMLInputElement && ["checkbox", "radio"].includes(source.type)
          ? (source.checked ? "Sí" : "No") : source.value;
      if (source instanceof HTMLInputElement && source.type === "hidden") text.hidden = true;
      control.replaceWith(text);
    });
    copy.querySelectorAll(".no-print, script").forEach((node) => node.remove());
    copy.querySelectorAll("img").forEach((img) => {
      img.loading = "eager";
      assets.push(waitForAsset(img));
    });
    doc.body.appendChild(copy);
    await Promise.all(assets);
    let fontTimeout: number | undefined;
    await Promise.race([doc.fonts.ready, new Promise<void>((resolve) => { fontTimeout = window.setTimeout(resolve, 15000); })]);
    window.clearTimeout(fontTimeout);
    // Force layout after fonts and images have settled, before opening preview.
    void doc.body.offsetHeight;
    printWindow.addEventListener("afterprint", cleanup, { once: true });
    cleanupTimer = window.setTimeout(cleanup, 300000);
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    cleanup();
    console.error("Error al imprimir el documento", error);
    window.alert("No se pudo preparar la impresión. Intenta nuevamente.");
  }
}

export const printCurrentDocument = (source?: HTMLElement) => {
  const areas = document.querySelectorAll<HTMLElement>(".print-area");
  const target = source?.closest<HTMLElement>(".print-area") ?? (areas.length === 1 ? areas[0] : null);
  return printDocument(target);
};
export const printDocumentById = (targetId: string) => printDocument(document.getElementById(targetId));
