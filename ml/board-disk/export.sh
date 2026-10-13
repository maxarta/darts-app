#!/usr/bin/env bash
# Export board-disk YOLO → Core ML + ONNX
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="${ROOT}/ml/.venv12/bin/python"
WEIGHTS="${1:-$DIR/runs/board-disk-fast/weights/best.pt}"
if [[ ! -f "$WEIGHTS" ]]; then
  WEIGHTS="$DIR/runs/board-disk/weights/best.pt"
fi
if [[ ! -f "$WEIGHTS" ]]; then
  echo "No weights at $WEIGHTS — train first" >&2
  exit 1
fi

export DARTS_APP_ROOT="$ROOT"
export BOARD_WEIGHTS="$WEIGHTS"
"$PY" <<'PY'
from ultralytics import YOLO
from pathlib import Path
import shutil, os

repo = Path(os.environ["DARTS_APP_ROOT"])
w = Path(os.environ["BOARD_WEIGHTS"])
m = YOLO(str(w))
onnx = Path(m.export(format="onnx", imgsz=640, simplify=True, opset=12))
ml = Path(m.export(format="coreml", imgsz=640, nms=True))

pub = repo / "public" / "models"
pub.mkdir(parents=True, exist_ok=True)
shutil.copy2(onnx, pub / "board-disk.onnx")

dest = repo / "ios" / "DartsScore" / "Resources" / "BoardDisk.mlpackage"
if dest.exists():
    shutil.rmtree(dest)
shutil.copytree(ml, dest)
print("Wrote", pub / "board-disk.onnx")
print("Wrote", dest)
PY
