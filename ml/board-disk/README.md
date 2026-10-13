# Board-disk detector

Single-class YOLOv8n (`board`) → bbox → circle for autoscore H-lock.

Tips still come from **DartSense**. This model only finds the board disk
(wood surrounds / no red mat).

## Train

```bash
# dataset already converted from AsmaaSobhyy/Darts_dataset calib points → board boxes
cd ml/board-disk
../.venv12/bin/yolo detect train data=dataset/board.yaml model=yolov8n.pt epochs=15 imgsz=640 batch=16 project=runs name=board-disk
```

## Export (Core ML + ONNX)

```bash
./export.sh runs/board-disk/weights/best.pt
```

Writes:

- `ios/DartsScore/Resources/BoardDisk.mlpackage`
- `public/models/board-disk.onnx`
