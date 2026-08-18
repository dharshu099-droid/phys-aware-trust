import type { PmuEvent } from "./types";

function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "-").replace(/([\\()])/g, "\\$1");
}

export function downloadPredictionPdf(event: PmuEvent, windowMs: number) {
  const result = event.referencePrediction;
  if (!result) return;
  const selected = result.window_predictions?.[String(windowMs)] ?? result;
  const lines = [
    "PMU Stability Screening Report",
    `Generated: ${new Date().toISOString()}`,
    `Dataset: ${event.name}`,
    `Event ID: ${event.id}`,
    `Analysis window: ${windowMs} ms`,
    "",
    `Screening result: ${selected.screening_result}`,
    `Stable proxy probability: ${selected.normal_probability.toFixed(4)}`,
    `Unstable proxy probability: ${selected.anomaly_probability.toFixed(4)}`,
    `Reliability score: ${selected.reliability_score.toFixed(4)}`,
    `Anomaly score: ${selected.anomaly_score.toFixed(5)}`,
    `Calibrated threshold: ${result.threshold.toFixed(5)}`,
    "",
    "Explanation",
    selected.reason,
    `Suspected PMU measurement location: ${result.suspected_pmu_location ?? "Not identifiable"}`,
    `Abnormal onset: ${result.disturbance_timing.detected ? `${result.disturbance_timing.onset_ms} ms` : "Not detected"}`,
    `Abnormal duration: ${result.disturbance_timing.duration_ms} ms`,
    "",
    "Feature contributions",
    ...result.feature_contributions.map((item) => `${item.feature}: ${item.contribution_percent.toFixed(1)}%`),
    "",
    "Limitations",
    result.warning,
    ...result.limitations,
  ];
  const wrapped: string[] = [];
  for (const line of lines) {
    if (!line) { wrapped.push(""); continue; }
    for (let i = 0; i < line.length; i += 88) wrapped.push(line.slice(i, i + 88));
  }
  const content = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL", ...wrapped.slice(0, 52).map((line, index) => `${index ? "T* " : ""}(${pdfEscape(line)}) Tj`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${event.name.replace(/\.csv$/i, "").replace(/[^a-z0-9_-]+/gi, "-")}-prediction.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
