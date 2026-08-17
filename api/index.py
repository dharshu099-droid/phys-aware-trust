from http.server import BaseHTTPRequestHandler
import csv, io, json, math, re
MEAN=0.00011507273840690215; STD=0.0005920882584557213; THRESHOLD=4.149646404331309
def uploaded(body, content_type):
    match=re.search(r"boundary=([^;]+)",content_type)
    if not match: raise ValueError("Expected multipart file upload.")
    boundary=("--"+match.group(1).strip('"')).encode()
    for part in body.split(boundary):
        if b"filename=" in part:
            head,data=part.split(b"\r\n\r\n",1); found=re.search(br'filename="([^"]+)"',head)
            return (found.group(1).decode(errors="replace") if found else "event.csv",data.rstrip(b"\r\n-"))
    raise ValueError("No uploaded file was found.")
def predict(name,content):
    rows=list(csv.reader(io.StringIO(content.decode("utf-8-sig",errors="replace"))))
    if len(rows)<27: raise ValueError("At least 27 angle samples are required.")
    header=[x.lower() for x in rows[0]]; candidates=[i for i,v in enumerate(header) if any(k in v for k in ("angle","theta","phase"))]
    if name.startswith(("_LBNL","LBNL")): index,data_rows,column=1,rows,"voltage_angle_deg"
    elif candidates: index,data_rows,column=candidates[0],rows[1:],rows[0][candidates[0]]
    else: raise ValueError("No voltage phase-angle column was detected.")
    angles=[math.radians(float(r[index])) for r in data_rows if len(r)>index and r[index].strip()]; unwrapped=[angles[0]]
    for value in angles[1:]: unwrapped.append(unwrapped[-1]+(value-unwrapped[-1]+math.pi)%(2*math.pi)-math.pi)
    z=[((unwrapped[i]-unwrapped[i-1])-MEAN)/STD for i in range(1,len(unwrapped))]
    scores=sorted(math.sqrt(sum(v*v for v in z[i:i+25])/25) for i in range(0,len(z)-24,25)); score=scores[max(0,math.ceil(.95*len(scores))-1)]
    ratio=score/THRESHOLD; probability=.5*ratio if ratio<=1 else .5+.5*(1-math.exp(-(ratio-1))); probability=max(0,min(1,probability))
    return {"file":name,"rows":len(data_rows),"angle_column":column,"decision":"Anomalous" if score>THRESHOLD else "Normal","anomaly_probability":probability,"normal_probability":1-probability,"anomaly_score":score,"threshold":THRESHOLD,"reliability_score":min(1,2*abs(probability-.5)),"model_status":"READY_ONE_CLASS","warning":"Calibrated one-class normal/anomaly detector; not a transient-stability label."}
class handler(BaseHTTPRequestHandler):
    def reply(self,status,payload):
        data=json.dumps(payload).encode(); self.send_response(status); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self): self.reply(200,{"status":"ok","model_status":"READY_ONE_CLASS"})
    def do_POST(self):
        try:
            name,data=uploaded(self.rfile.read(int(self.headers.get("Content-Length","0"))),self.headers.get("Content-Type","")); self.reply(200,predict(name,data))
        except Exception as exc: self.reply(422,{"detail":str(exc)})
