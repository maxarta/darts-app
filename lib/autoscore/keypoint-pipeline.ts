import {
  applyHomography,
  homographyFromCalib,
  type Homography3,
  type Point2,
} from "./homography";
import { VisitFsm, type VisitEvent } from "./visit-fsm";
import { splitDetections, type YoloDetection } from "./yolo-decode";

/**
 * End-to-end: YOLO dets → H → board tips → visit events.
 * Shared by web ONNX and (via mirrored Swift) native Core ML.
 */
export class KeypointPipeline {
  readonly visit = new VisitFsm();
  private H: Homography3 | null = null;
  private calibEma: (Point2 | null)[] = [null, null, null, null];

  reset() {
    this.visit.reset();
    this.H = null;
    this.calibEma = [null, null, null, null];
  }

  beginWaitClear(): VisitEvent[] {
    return this.visit.beginWaitClear();
  }

  /** Process one frame of detections (normalized image coords). */
  pushDetections(dets: YoloDetection[]): VisitEvent[] {
    const { calib, tips, tipConf } = splitDetections(dets);

    // EMA-stabilize calib points when present
    const smoothed = calib.map((p, i) => {
      if (!p) return null;
      const prev = this.calibEma[i];
      if (!prev) {
        this.calibEma[i] = p;
        return p;
      }
      const next = {
        x: prev.x * 0.7 + p.x * 0.3,
        y: prev.y * 0.7 + p.y * 0.3,
      };
      this.calibEma[i] = next;
      return next;
    });

    const H = homographyFromCalib(smoothed);
    const calibLocked = H != null;
    if (H) {
      this.H = H;
      this.visit.setHomography(H);
    }

    const boardTips: Point2[] = [];
    const boardConf: number[] = [];
    if (this.H) {
      for (let i = 0; i < tips.length; i++) {
        boardTips.push(applyHomography(this.H, tips[i]!));
        boardConf.push(tipConf[i] ?? 0.8);
      }
    }

    return this.visit.pushBoardTips(boardTips, {
      calibLocked,
      tipConf: boardConf,
    });
  }
}
