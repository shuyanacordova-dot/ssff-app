// Print only a snapshot of the requested document, never the surrounding app/modal.
let printing = false;
let cleanupPreviousFrame: (() => void) | undefined;

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

// A4 con márgenes de 12 mm (ver @page en globals.css): área útil 186 × 273 mm.
const MM = 96 / 25.4;
const A4_UTIL_ALTO_PX = 273 * MM;

// Reglas de @media print del sistema, para simular en pantalla cómo quedará la hoja y medirla.
function reglasDeImpresion() {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule && /\bprint\b/.test(rule.media.mediaText)) css += Array.from(rule.cssRules, (r) => r.cssText).join("\n");
    }
  }
  return css;
}

// Reduce el documento lo justo para que quepa en una sola hoja A4 (recetas, revisiones, informes de convenio).
function ajustarAUnaHoja(doc: Document, copy: HTMLElement) {
  const sim = doc.createElement("style");
  sim.textContent = `${reglasDeImpresion()}\nbody.print-context { width: 186mm !important; }`;
  doc.head.appendChild(sim);
  copy.style.zoom = "";
  void doc.body.offsetHeight;
  const alto = copy.getBoundingClientRect().height;
  sim.remove();
  if (alto > A4_UTIL_ALTO_PX) {
    // 2 % de margen de seguridad por diferencias de redondeo entre pantalla e impresora.
    copy.style.zoom = String(Math.max(0.4, (A4_UTIL_ALTO_PX / alto) * 0.98));
  }
  copy.style.breakInside = "avoid";
}

async function prepareDocument(doc: Document, target: HTMLElement, unaHoja = false) {
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
  if (unaHoja) ajustarAUnaHoja(doc, copy);
}

async function printInNewWindow(target: HTMLElement, unaHoja = false) {
  // Open before waiting for assets so iOS retains the user gesture.
  const popup = window.open("", "_blank");
  if (!popup) {
    window.alert("No se pudo abrir la impresión. Permite las ventanas emergentes de LumOS e intenta imprimir nuevamente.");
    return;
  }
  try {
    await prepareDocument(popup.document, target, unaHoja);
    popup.focus();
    popup.print();
  } catch (error) {
    console.error("Error al imprimir en una ventana nueva", error);
    window.alert("No se pudo preparar la impresión. Cierra la ventana de impresión e intenta nuevamente.");
  }
  // Leave the document available: Safari can return before preview opens.
}

async function printDocument(target: HTMLElement | null, unaHoja = false) {
  if (!target || printing) return;
  printing = true;
  cleanupPreviousFrame?.();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (isIOS) {
    try { await printInNewWindow(target, unaHoja); }
    finally { printing = false; }
    return;
  }

  const frame = document.createElement("iframe");
  frame.title = "Documento para imprimir";
  frame.setAttribute("aria-hidden", "true");
  // Keep a real layout viewport (not display:none) for styles and image loading.
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;pointer-events:none";
  let cleanupTimer: number | undefined;
  const cleanup = () => {
    window.clearTimeout(cleanupTimer);
    frame.remove();
    if (cleanupPreviousFrame === cleanup) cleanupPreviousFrame = undefined;
  };
  cleanupPreviousFrame = cleanup;
  try {
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!doc || !printWindow) throw new Error("No se pudo preparar la impresión.");
    await prepareDocument(doc, target, unaHoja);
    printWindow.addEventListener("afterprint", cleanup, { once: true });
    printWindow.focus();
    printWindow.print();
    printing = false;
    // Lifetime of the document is independent of the lock on new print requests.
    if (frame.isConnected) cleanupTimer = window.setTimeout(cleanup, 60000);
  } catch (error) {
    cleanup();
    console.error("Error al imprimir el documento; intentando una ventana nueva", error);
    await printInNewWindow(target, unaHoja);
  } finally {
    printing = false;
  }
}

export const printCurrentDocument = (source?: HTMLElement) => {
  const areas = document.querySelectorAll<HTMLElement>(".print-area");
  const target = source?.closest<HTMLElement>(".print-area") ?? (areas.length === 1 ? areas[0] : null);
  return printDocument(target);
};
// unaHoja: el documento se reduce para que siempre quepa en una sola hoja A4.
export const printDocumentById = (targetId: string, opciones?: { unaHoja?: boolean }) => printDocument(document.getElementById(targetId), opciones?.unaHoja ?? false);
