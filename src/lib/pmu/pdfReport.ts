import type { OneClassPrediction } from "./backend";
import type { PmuEvent } from "./types";

function escapePdf(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "-").replace(/([\\()])/g, "\\$1");
}

function text(x: number, y: number, value: string, size = 10, font = "F1") {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`;
}

function wrappedText(x: number, y: number, value: string, width = 88, size = 9, leading = 12) {
  const words = value.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width) { lines.push(line); line = word; } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return { commands: lines.map((item, index) => text(x, y - index * leading, item, size)).join("\n"), nextY: y - lines.length * leading };
}

function stream(value: string) {
  return `<< /Length ${value.length} >>\nstream\n${value}\nendstream`;
}

function metricFor(result: OneClassPrediction, windowMs: number) {
  return result.window_predictions?.[String(windowMs)] ?? result;
}

function pageOne(event: PmuEvent, selectedWindow: number) {
  const result = event.referencePrediction!; const selected = metricFor(result, selectedWindow); const commands: string[] = [];
  commands.push("0.04 0.12 0.20 rg", "35 785 525 34 re f", "1 1 1 rg", text(50, 796, "PMU STABILITY SCREENING REPORT", 17, "F2"), "0 0 0 rg");
  commands.push(text(40, 758, `Dataset: ${event.name}`, 10, "F2"), text(40, 742, `Event ID: ${event.id}    Generated: ${new Date().toISOString()}`, 8));
  commands.push("0.92 0.96 0.98 rg", "35 676 525 50 re f", "0 0 0 rg", text(48, 704, `SELECTED RESULT: ${selected.screening_result.toUpperCase()}`, 16, "F2"));
  commands.push(text(48, 686, `Selected observation window: ${selectedWindow} ms`, 10));
  commands.push(text(40, 650, "SELECTED-WINDOW VALUES", 12, "F2"));
  const selectedRows = [
    ["Stable proxy probability", selected.normal_probability.toFixed(4)], ["Unstable proxy probability", selected.anomaly_probability.toFixed(4)],
    ["Reliability score", selected.reliability_score.toFixed(4)], ["Anomaly score", selected.anomaly_score.toFixed(5)],
    ["Calibrated anomaly threshold", result.threshold.toFixed(5)], ["Processed CSV rows", String(result.rows)],
  ];
  selectedRows.forEach(([label, value], i) => { const y = 628 - i * 20; commands.push(i % 2 ? "0.97 0.97 0.97 rg" : "1 1 1 rg", `40 ${y - 5} 515 20 re f`, "0 0 0 rg", text(48, y, label!, 9), text(420, y, value!, 9, "F2")); });
  commands.push(text(40, 494, "ALL OBSERVATION-WINDOW RESULTS", 12, "F2"));
  commands.push("0.1 0.3 0.45 rg", "40 462 515 22 re f", "1 1 1 rg");
  ["Window", "Stable P", "Unstable P", "Reliability", "Anomaly score", "Decision"].forEach((label, i) => commands.push(text([48,120,200,286,375,476][i]!, 469, label, 8, "F2")));
  const windows = [100, 200, 300, 500];
  windows.forEach((ms, row) => {
    const item = metricFor(result, ms); const y = 442 - row * 23;
    commands.push(row % 2 ? "0.95 0.97 0.98 rg" : "1 1 1 rg", `40 ${y - 6} 515 23 re f`, "0 0 0 rg");
    [String(ms)+" ms",item.normal_probability.toFixed(4),item.anomaly_probability.toFixed(4),item.reliability_score.toFixed(4),item.anomaly_score.toFixed(4),item.screening_result].forEach((value,i)=>commands.push(text([48,120,200,286,375,476][i]!,y,value,8,i===5?"F2":"F1")));
  });
  commands.push(text(40, 332, "EXPLAINABLE-AI CONTRIBUTIONS", 12, "F2"));
  result.feature_contributions.slice(0,5).forEach((item,i)=>{
    const y=308-i*24, bar=Math.min(260,item.contribution_percent*2.6); commands.push(text(48,y,`${item.feature}: ${item.contribution_percent.toFixed(1)}%`,8),"0.86 0.90 0.93 rg",`250 ${y-2} 260 8 re f`,"0.05 0.45 0.62 rg",`250 ${y-2} ${bar.toFixed(1)} 8 re f`);
  });
  commands.push("0 0 0 rg",text(40,176,"EVENT LOCALISATION AND TIMING",12,"F2"),text(48,154,`Suspected PMU measurement location: ${result.suspected_pmu_location ?? "Not identifiable from CSV headers"}`,9),text(48,137,`Detected abnormal onset: ${result.disturbance_timing.detected ? `${result.disturbance_timing.onset_ms} ms` : "not detected"}`,9),text(48,120,`Detected abnormal duration: ${result.disturbance_timing.duration_ms} ms`,9));
  const explanation=wrappedText(48,94,selected.reason,92,8,11);commands.push(text(40,104,"MODEL EXPLANATION",12,"F2"),explanation.commands,text(250,24,"Page 1 of 2",8));
  return commands.join("\n");
}

function pageTwo(event: PmuEvent) {
  const result=event.referencePrediction!; const commands:string[]=[]; const windows=[100,200,300,500];
  commands.push("0.04 0.12 0.20 rg","35 785 525 34 re f","1 1 1 rg",text(50,796,"WINDOW EFFECTS AND RELATIONSHIPS",17,"F2"),"0 0 0 rg");
  commands.push(text(40,755,"WINDOW-COMPARISON GRAPH",12,"F2"));
  const left=70,bottom=440,width=450,height=270;
  commands.push("0.85 0.88 0.90 RG","0.5 w");
  for(let i=0;i<=5;i++){const y=bottom+i*height/5;commands.push(`${left} ${y} m ${left+width} ${y} l S`,text(40,y-3,(i/5).toFixed(1),8));}
  commands.push("0 0 0 RG","1 w",`${left} ${bottom} m ${left} ${bottom+height} l S`,`${left} ${bottom} m ${left+width} ${bottom} l S`,text(245,414,"Observation window (ms)",9,"F2"),text(18,570,"0-1 scale",8));
  windows.forEach((ms,i)=>commands.push(text(left+i*(width/3)-10,bottom-18,String(ms),8)));
  const series=[
    {label:"Stable probability",color:"0.05 0.55 0.35",values:windows.map(ms=>metricFor(result,ms).normal_probability)},
    {label:"Unstable probability",color:"0.80 0.15 0.15",values:windows.map(ms=>metricFor(result,ms).anomaly_probability)},
    {label:"Reliability",color:"0.10 0.35 0.75",values:windows.map(ms=>metricFor(result,ms).reliability_score)},
  ];
  series.forEach((series,index)=>{const points=series.values.map((value,i)=>({x:left+i*width/3,y:bottom+value*height}));commands.push(`${series.color} RG`,`2 w`,points.map((point,i)=>`${point.x} ${point.y} ${i?"l":"m"}`).join("\n"),"S",`${series.color} rg`,...points.map(point=>`${point.x-2.5} ${point.y-2.5} 5 5 re f`),`40 ${380-index*18} 14 3 re f`,"0 0 0 rg",text(60,377-index*18,series.label,9));});
  commands.push(text(40,315,"HOW THE VALUES ARE RELATED",12,"F2"));
  const relations=[
    "1. Window length determines how many timestamped PMU samples are analysed.",
    "2. The calibrated feature-deviation score produces the anomaly probability.",
    "3. Stable proxy probability = 1 - unstable proxy probability.",
    "4. Reliability = 2 x abs(unstable proxy probability - 0.5).",
    "5. Stable requires low unstable probability and sufficient reliability; Unstable requires high unstable probability and sufficient reliability. Otherwise the decision is Uncertain.",
    "6. Longer windows add temporal evidence, but they do not guarantee higher reliability; the values depend on the uploaded waveform.",
  ];
  let y=292;for(const relation of relations){const block=wrappedText(48,y,relation,91,9,12);commands.push(block.commands);y=block.nextY-7;}
  commands.push(text(40,165,"INTERPRETATION LIMITS",12,"F2"));
  const limits=[result.warning,...result.limitations];y=143;for(const limit of limits){const block=wrappedText(48,y,`- ${limit}`,92,8,11);commands.push(block.commands);y=block.nextY-5;}
  commands.push(text(40,65,"The exported probabilities are calibrated anomaly-based screening proxies. They are not",8),text(40,53,"ground-truth stability labels and must not be used as a certified protection decision.",8),text(250,24,"Page 2 of 2",8));
  return commands.join("\n");
}

function createPdf(firstPage:string,secondPage:string){
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> /Contents 5 0 R >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> /Contents 6 0 R >>",stream(firstPage),stream(secondPage),"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  let pdf="%PDF-1.4\n";const offsets=[0];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return pdf;
}

export function generatePredictionPdf(event:PmuEvent,windowMs:number){
  if(!event.referencePrediction)return null;
  return createPdf(pageOne(event,windowMs),pageTwo(event));
}

export function downloadPredictionPdf(event:PmuEvent,windowMs:number){
  const pdf=generatePredictionPdf(event,windowMs);if(!pdf)return;const blob=new Blob([pdf],{type:"application/pdf"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`${event.name.replace(/\.csv$/i,"").replace(/[^a-z0-9_-]+/gi,"-")}-complete-report.pdf`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
