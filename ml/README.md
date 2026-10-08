# Autoscore ML (dart-sense)

YOLOv8n tip + board calib points (classes: `20`, `3`, `11`, `6`, `dart`, `9`, `15`).

## Export

```bash
cd ml
/usr/local/bin/python3.12 -m venv .venv12
source .venv12/bin/activate
pip install torch torchvision ultralytics==8.3.50 onnx
./export.sh
```

Outputs:

- `public/models/dart-sense.onnx` — browser (`onnxruntime-web`)
- `ios/DartsScore/Resources/DartSense.mlpackage` — Core ML (Vision)

Weights source: [bnww/dart-sense](https://github.com/bnww/dart-sense) `test` branch `weights.pt` (multi-board, not fine-tuned to one surround).
