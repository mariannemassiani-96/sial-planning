// ── Utilitaire d'impression SIAL Planning ────────────────────────────────────
// Ouvre une nouvelle fenêtre avec un aperçu imprimable propre.

export const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; padding: 20px 24px; font-size: 11px; }
  h1 { font-size: 17px; font-weight: 800; letter-spacing: .03em; }
  h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
       border-bottom: 1.5px solid #000; padding-bottom: 3px; margin: 18px 0 8px; color: #000; }
  h3 { font-size: 11px; font-weight: 700; margin: 10px 0 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2.5px solid #000; padding-bottom: 10px; margin-bottom: 18px; }
  .header-left h1 span { font-weight: 300; color: #555; margin: 0 4px; }
  .header-right { font-size: 10px; color: #444; text-align: right; line-height: 1.5; }
  .subtitle { font-size: 12px; color: #333; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th { background: #e8e8e8; border: 1px solid #888; padding: 4px 7px; text-align: left;
       font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  td { border: 1px solid #bbb; padding: 4px 7px; vertical-align: top; line-height: 1.4; }
  td.center { text-align: center; }
  tr:nth-child(even) td { background: #f8f8f8; }
  .badge { display: inline-block; padding: 1px 5px; border: 1px solid #888;
           border-radius: 2px; font-size: 9px; margin: 1px; white-space: nowrap; }
  .ok   { color: #166116; font-weight: 700; }
  .warn { color: #7a4000; font-weight: 700; }
  .crit { color: #990000; font-weight: 700; }
  .mono { font-family: 'Courier New', monospace; }
  .bar-wrap { background: #ddd; border-radius: 2px; height: 5px; margin-top: 3px; width: 100%; }
  .bar-fill { height: 5px; border-radius: 2px; }
  .section-card { border: 1px solid #bbb; border-radius: 3px; padding: 10px 12px; margin-bottom: 10px; }
  .poste-header { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
  .stats { display: flex; gap: 16px; font-size: 10px; color: #333; margin-bottom: 8px; }
  .tag { display: inline-block; padding: 2px 7px; border: 1px solid #ccc;
         border-radius: 10px; font-size: 9px; margin: 2px; }
  .footer { margin-top: 24px; border-top: 1px solid #ccc; padding-top: 8px;
            font-size: 9px; color: #777; display: flex; justify-content: space-between; }
  @media screen {
    .print-btn-bar { position: sticky; top: 0; background: #fff; padding: 10px 0 12px;
                     border-bottom: 1px solid #ddd; margin-bottom: 16px; display: flex; gap: 8px; z-index: 10; }
    .btn-print { padding: 7px 18px; background: #000; color: #fff; border: none;
                 cursor: pointer; font-size: 12px; border-radius: 4px; font-weight: 700; }
    .btn-close { padding: 7px 14px; background: #fff; color: #000; border: 1.5px solid #000;
                 cursor: pointer; font-size: 12px; border-radius: 4px; }
    .watermark { display: none; }
  }
  @media print {
    .print-btn-bar { display: none !important; }
    body { padding: 10px 14px; }
    @page { margin: 1.2cm 1.4cm; size: A4; }
  }
`;

export function openPrintWindow(title: string, htmlBody: string): void {
  const w = window.open("", "_blank", "width=900,height=720");
  if (!w) { alert("Impossible d'ouvrir la fenêtre d'impression. Vérifiez les popups."); return; }
  const now = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  w.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>SIAL Planning — ${title}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="print-btn-bar">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimer</button>
    <button class="btn-close" onclick="window.close()">✕ Fermer</button>
    <span style="font-size:11px;color:#555;align-self:center;margin-left:8px">Aperçu avant impression — ${title}</span>
  </div>
  ${htmlBody}
  <div class="footer">
    <span>SIAL Planning — Imprimé le ${now}</span>
    <span class="mono">${title}</span>
  </div>
</body>
</html>`);
  w.document.close();
}

export function fmtDatePrint(d?: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function hmPrint(m: number): string {
  if (!m) return "—";
  return `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;
}

export function pctColor(pct: number): string {
  return pct > 90 ? "#990000" : pct > 70 ? "#7a4000" : "#166116";
}
