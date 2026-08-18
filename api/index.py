from http.server import BaseHTTPRequestHandler
from datetime import datetime
import csv, io, json, math, re

MEANS=[78389.86001769644,35.19818668621648,1.0912980553707634,50.17368609541755,-0.00044235507233879366]
STDS=[34.13145589019357,0.622236381727039,0.15235175335518222,0.024289710514584083,0.10188136009628337]
NAMES=["Voltage magnitude","Current magnitude","Voltage phase rate","Frequency","ROCOF"]
THRESHOLD=1.3654293642742266

def uploaded(body,content_type):
    match=re.search(r"boundary=([^;]+)",content_type)
    if not match: raise ValueError("Expected multipart file upload.")
    for part in body.split(("--"+match.group(1).strip('"')).encode()):
        if b"filename=" in part:
            head,data=part.split(b"\r\n\r\n",1); found=re.search(br'filename="([^"]+)"',head)
            return (found.group(1).decode(errors="replace") if found else "event.csv",data.rstrip(b"\r\n-"))
    raise ValueError("No uploaded file was found.")

def unwrap(values):
    out=[values[0]]
    for value in values[1:]: out.append(out[-1]+(value-out[-1]+math.pi)%(2*math.pi)-math.pi)
    return out

def interval_ms(header,data):
    index=next((i for i,v in enumerate(header) if v in ("time","timestamp","date_time","datetime","t")),None)
    if index is None:return 20.0
    values=[]
    for row in data[:100]:
        try:
            raw=row[index].strip().replace("Z","+00:00")
            try: values.append(float(raw))
            except ValueError: values.append(datetime.fromisoformat(raw).timestamp())
        except (ValueError,IndexError):pass
    diffs=sorted(values[i]-values[i-1] for i in range(1,len(values)) if values[i]>values[i-1])
    if not diffs:return 20.0
    dt=diffs[len(diffs)//2]
    return dt/1_000_000 if dt>1000 else dt if dt>10 else dt*1000

def location(header):
    match=re.search(r"(?:mag|angle)_[vi]_(.+)$",header,re.I)
    return match.group(1) if match else None

def explanations(header,data,z,voltage,current,angles):
    energy=[sum(row[j]**2 for row in z)/len(z) for j in range(5)]; total=sum(energy) or 1
    contributions=[{"feature":NAMES[i],"contribution_percent":round(100*v/total,2),"deviation_score":round(math.sqrt(v),4)} for i,v in sorted(enumerate(energy),key=lambda x:x[1],reverse=True)]
    groups={}
    for index in voltage+current+angles:
        loc=location(header[index])
        if loc:groups.setdefault(loc,[]).append(index)
    location_scores=[]
    for loc,indices in groups.items():
        deviations=[]
        for index in indices:
            values=[]
            for row in data:
                try:values.append(float(row[index]))
                except (ValueError,IndexError):pass
            if len(values)>1:
                mean=sum(values)/len(values); spread=math.sqrt(sum((v-mean)**2 for v in values)/len(values))
                deviations.append(spread/(abs(mean)+1e-9))
        if deviations:location_scores.append((sum(deviations)/len(deviations),loc))
    suspected=max(location_scores)[1] if location_scores else None
    window=25; windows=[]
    for start in range(0,len(z)-window+1,window):windows.append((start,math.sqrt(sum(v*v for row in z[start:start+window] for v in row)/(window*5))))
    abnormal=[start for start,score in windows if score>THRESHOLD]; dt=interval_ms(header,data)
    if abnormal:
        longest=count=1; previous=abnormal[0]
        for start in abnormal[1:]:
            count=count+1 if start==previous+window else 1; longest=max(longest,count); previous=start
        timing={"detected":True,"onset_ms":round(abnormal[0]*dt,2),"duration_ms":round(longest*window*dt,2),"method":"contiguous 25-sample windows above the calibrated threshold"}
    else:timing={"detected":False,"onset_ms":None,"duration_ms":0,"method":"no 25-sample window exceeded the calibrated threshold"}
    return contributions,suspected,timing,windows

def predict(name,content):
    rows=list(csv.reader(io.StringIO(content.decode("utf-8-sig",errors="replace"))))
    if len(rows)<27:raise ValueError("At least 27 PMU samples are required.")
    header=[x.strip().lower() for x in rows[0]]
    frequency=next((i for i,v in enumerate(header) if v in ("frequency","freq","f")),None)
    rocof=next((i for i,v in enumerate(header) if v in ("dfrequency","rocof","dfdt")),None)
    voltage=[i for i,v in enumerate(header) if v.startswith("mag_v") or "voltage_magnitude" in v]
    current=[i for i,v in enumerate(header) if v.startswith("mag_i") or "current_magnitude" in v]
    angles=[i for i,v in enumerate(header) if v.startswith("angle_v") or "voltage_angle" in v or "theta" in v]
    contributions=[]; suspected=None; timing={"detected":False,"onset_ms":None,"duration_ms":0,"method":"timing unavailable for this schema"}
    if frequency is not None and rocof is not None and voltage and current and angles:
        valid=[]; phases=[[] for _ in angles]; features=[]
        for row in rows[1:]:
            try:
                phase=[math.radians(float(row[i])) for i in angles]
                feature=[sum(float(row[i]) for i in voltage)/len(voltage),sum(float(row[i]) for i in current)/len(current),0.0,float(row[frequency]),float(row[rocof])]
                for i,value in enumerate(phase):phases[i].append(value)
                valid.append(row);features.append(feature)
            except (ValueError,IndexError):pass
        if len(features)<25:raise ValueError("At least 25 valid PMU samples are required.")
        phase_columns=[unwrap(p) for p in phases]; combined=[sum(p[i] for p in phase_columns)/len(phase_columns) for i in range(len(features))]
        dt=max(interval_ms(header,valid)/1000,1e-6)
        for i in range(len(features)):
            span=1 if i in (0,len(features)-1) else 2
            features[i][2]=(combined[min(i+1,len(combined)-1)]-combined[max(i-1,0)])/(span*dt)
        z=[[(row[j]-MEANS[j])/STDS[j] for j in range(5)] for row in features]
        contributions,suspected,timing,windows=explanations(header,valid,z,voltage,current,angles)
        scores=sorted(score for _,score in windows); score=scores[max(0,math.ceil(.95*len(scores))-1)]
        column="common PMU channels"; data_rows=valid
    else:
        candidates=[i for i,v in enumerate(header) if any(k in v for k in ("angle","theta","phase"))]
        if name.startswith(("_LBNL","LBNL")):index,data_rows,column=1,rows,"voltage_angle_deg"
        elif candidates:index,data_rows,column=candidates[0],rows[1:],rows[0][candidates[0]]
        else:raise ValueError("Required common PMU channels or a voltage phase-angle column were not detected.")
        values=unwrap([math.radians(float(row[index])) for row in data_rows if len(row)>index and row[index].strip()])
        z=[((values[i]-values[i-1])-0.00011507273840690215)/0.0005920882584557213 for i in range(1,len(values))]
        scores=sorted(math.sqrt(sum(v*v for v in z[i:i+25])/25) for i in range(0,len(z)-24,25));score=scores[max(0,math.ceil(.95*len(scores))-1)]
        contributions=[{"feature":"Voltage phase-angle change","contribution_percent":100.0,"deviation_score":round(score,4)}]
    ratio=score/THRESHOLD; probability=.5*ratio if ratio<=1 else .5+.5*(1-math.exp(-(ratio-1)));probability=max(0,min(1,probability));reliability=min(1,2*abs(probability-.5))
    if probability<=.40 and reliability>=.50:decision,screening="Normal","Stable"
    elif probability>=.60 and reliability>=.50:decision,screening="Anomalous","Unstable"
    else:decision,screening="Uncertain","Uncertain"
    top=contributions[0]["feature"] if contributions else "available PMU measurements"
    return {"file":name,"rows":len(data_rows),"angle_column":column,"decision":decision,"screening_result":screening,"screening_only":True,"anomaly_probability":probability,"normal_probability":1-probability,"anomaly_score":score,"threshold":THRESHOLD,"reliability_score":reliability,"model_status":"READY_ONE_CLASS","reason":f"{screening} screening because anomaly probability is {probability:.3f} and reliability is {reliability:.3f}; the largest measured contribution is {top}.","feature_contributions":contributions,"suspected_pmu_location":suspected,"disturbance_timing":timing,"warning":"This is a calibrated PMU anomaly-based stability screening proxy, not a validated transient-stability classifier.","limitations":["The suspected PMU is the measurement location with the strongest relative deviation, not a confirmed physical fault location.","Detected duration describes abnormal PMU measurements, not remaining motor life or safe operating time."]}

class handler(BaseHTTPRequestHandler):
    def reply(self,status,payload):
        data=json.dumps(payload).encode();self.send_response(status);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(data)));self.end_headers();self.wfile.write(data)
    def do_GET(self):self.reply(200,{"status":"ok","model_status":"READY_ONE_CLASS"})
    def do_POST(self):
        try:
            name,data=uploaded(self.rfile.read(int(self.headers.get("Content-Length","0"))),self.headers.get("Content-Type",""));self.reply(200,predict(name,data))
        except Exception as exc:self.reply(422,{"detail":str(exc)})
