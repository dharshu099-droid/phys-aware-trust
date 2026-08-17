from pathlib import Path
import csv, math

OUT = Path(__file__).resolve().parents[1] / "public" / "downloads"
OUT.mkdir(parents=True, exist_ok=True)
HEADER = ["Date_Time", "Mag_VA_1_4", "Angle_VA_1_4", "Mag_IA_1_4", "Angle_IA_1_4", "Frequency", "Dfrequency"]


def write(name: str, anomalous: bool):
    with (OUT / name).open("w", newline="") as handle:
        writer = csv.writer(handle); writer.writerow(HEADER)
        for index in range(250):
            seconds = index * 0.02
            if anomalous:
                voltage = 70000 + 800 * math.sin(index / 4)
                current = 55 + 5 * math.sin(index / 3)
                angle = (index * 5 + 25 * math.sin(index / 2)) % 360
                frequency = 48.8 + 0.35 * math.sin(index / 5)
                rocof = 1.8 * math.cos(index / 5)
            else:
                voltage = 78389.86001769644
                current = 35.19818668621648
                angle = math.degrees(1.0912980553707634 * seconds) % 360
                frequency = 50.17368609541755
                rocof = -0.00044235507233879366
            writer.writerow([f"2026-01-01T00:00:{seconds:06.3f}Z", voltage, angle, current, 0, frequency, rocof])


write("synthetic-normal-pmu.csv", False)
write("synthetic-anomalous-pmu.csv", True)
