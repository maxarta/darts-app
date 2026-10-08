#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/ml/dart-sense"
cd "$DIR"

if [[ ! -f weights.pt ]]; then
  echo "Downloading weights.pt…"
  curl -sL "https://raw.githubusercontent.com/bnww/dart-sense/test/weights.pt" -o weights.pt
fi

export DARTS_APP_ROOT="$ROOT"
python <<'PY'
from ultralytics import YOLO
from pathlib import Path
import shutil
import os

repo = Path(os.environ["DARTS_APP_ROOT"])
m = YOLO("weights.pt")
onnx = Path(m.export(format="onnx", imgsz=640, simplify=True, opset=12))
ml = Path(m.export(format="coreml", imgsz=640, nms=True))

pub = repo / "public" / "models"
pub.mkdir(parents=True, exist_ok=True)
shutil.copy2(onnx, pub / "dart-sense.onnx")

dest = repo / "ios" / "DartsScore" / "Resources" / "DartSense.mlpackage"
if dest.exists():
    shutil.rmtree(dest)
shutil.copytree(ml, dest)
print("Wrote", pub / "dart-sense.onnx")
print("Wrote", dest)
PY
