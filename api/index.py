from http.server import BaseHTTPRequestHandler
import csv, io, json, math, re
MEANS=[78389.86001769644,35.19818668621648,1.0912980553707634,50.17368609541755,-0.00044235507233879366]
STDS=[34.13145589019357,0.622236381727039,0.15235175335518222,0.024289710514584083,0.10188136009628337]
THRESHOLD=1.3654293642742266
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
    header=[x.lower() for x in rows[0]]
    frequency=next((i for i,v in enumerate(header) if v in ("frequency","freq","f")),None)
    rocof=next((i for i,v in enumerate(header) if v in ("dfrequency","rocof","dfdt")),None)
    voltage=[i for i,v in enumerate(header) if v.startswith("mag_v") or "voltage_magnitude" in v]
    current=[i for i,v in enumerate(header) if v.startswith("mag_i") or "current_magnitude" in v]
    angles_idx=[i for i,v in enumerate(header) if v.startswith("angle_v") or "voltage_angle" in v or "theta" in v]
    if frequency is not None and rocof is not None and voltage and current and angles_idx:
        data=rows[1:]; phase_columns=[[] for _ in angles_idx]; feature_rows=[]
        for row in data:
            try:
                for position,index in enumerate(angles_idx): phase_columns[position].append(math.radians(float(row[index])))
                feature_rows.append([sum(float(row[i]) for i in voltage)/len(voltage),sum(float(row[i]) for i in current)/len(current),0.0,float(row[frequency]),float(row[rocof])])
            except (ValueError,IndexError): continue
        unwrapped_columns=[]
        for phase in phase_columns:
            values=[phase[0]]
            for value in phase[1:]: values.append(values[-1]+(value-values[-1]+math.pi)%(2*math.pi)-math.pi)
            unwrapped_columns.append(values)
        unwrapped=[sum(column[i] for column in unwrapped_columns)/len(unwrapped_columns) for i in range(len(feature_rows))]
        for i in range(len(feature_rows)): feature_rows[i][2]=(unwrapped[min(i+1,len(unwrapped)-1)]-unwrapped[max(i-1,0)])/.04
        z=[[ (row[j]-MEANS[j])/STDS[j] for j in range(5)] for row in feature_rows]
        scores=sorted(math.sqrt(sum(v*v for row in z[i:i+25] for v in row)/(25*5)) for i in range(0,len(z)-24,25)); score=scores[max(0,math.ceil(.95*len(scores))-1)]
        column="common PMU channels"; data_rows=data
    else:
        candidates=[i for i,v in enumerate(header) if any(k in v for k in ("angle","theta","phase"))]
        if name.startswith(("_LBNL","LBNL")): index,data_rows,column=1,rows,"voltage_angle_deg"
        elif candidates: index,data_rows,column=candidates[0],rows[1:],rows[0][candidates[0]]
        else: raise ValueError("Required common PMU channels or a voltage phase-angle column were not detected.")
        angles=[math.radians(float(r[index])) for r in data_rows if len(r)>index and r[index].strip()]; unwrapped=[angles[0]]
        for value in angles[1:]: unwrapped.append(unwrapped[-1]+(value-unwrapped[-1]+math.pi)%(2*math.pi)-math.pi)
        z=[((unwrapped[i]-unwrapped[i-1])-0.00011507273840690215)/0.0005920882584557213 for i in range(1,len(unwrapped))]
        scores=sorted(math.sqrt(sum(v*v for v in z[i:i+25])/25) for i in range(0,len(z)-24,25)); score=scores[max(0,math.ceil(.95*len(scores))-1)]
    ratio=score/THRESHOLD; probability=.5*ratio if ratio<=1 else .5+.5*(1-math.exp(-(ratio-1))); probability=max(0,min(1,probability))
    reliability=min(1,2*abs(probability-.5))
    if probability<=.40 and reliability>=.50: decision="Normal"
    elif probability>=.60 and reliability>=.50: decision="Anomalous"
    else: decision="Uncertain"
    return {"file":name,"rows":len(data_rows),"angle_column":column,"decision":decision,"anomaly_probability":probability,"normal_probability":1-probability,"anomaly_score":score,"threshold":THRESHOLD,"reliability_score":reliability,"model_status":"READY_ONE_CLASS","warning":"Calibrated from the selected frequency-event PMU reference; Normal/Anomalous is not a transient-stability label."}
class handler(BaseHTTPRequestHandler):
    def reply(self,status,payload):
        data=json.dumps(payload).encode(); self.send_response(status); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self): self.reply(200,{"status":"ok","model_status":"READY_ONE_CLASS"})
    def do_POST(self):
        try:
            name,data=uploaded(self.rfile.read(int(self.headers.get("Content-Length","0"))),self.headers.get("Content-Type","")); self.reply(200,predict(name,data))
        except Exception as exc: self.reply(422,{"detail":str(exc)})
