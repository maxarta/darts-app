import { decodeYoloV8, type YoloDetection } from "./yolo-decode";

type OrtSession = {
  run: (
    feeds: Record<string, unknown>
  ) => Promise<Record<string, { data: Float32Array; dims: number[] }>>;
  inputNames: string[];
  outputNames: string[];
};

type OrtTensor = new (
  type: string,
  data: Float32Array,
  dims: number[]
) => unknown;

type OrtModule = {
  InferenceSession: {
    create: (
      path: string | ArrayBuffer,
      opts?: { executionProviders?: string[] }
    ) => Promise<OrtSession>;
  };
  Tensor: OrtTensor;
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
};

const DEFAULT_MODEL_URL = "/models/dart-sense.onnx";
const IMGSZ = 640;

/**
 * Browser YOLO tip+calib detector via onnxruntime-web.
 * Lazy-loads ORT; fails soft if WASM/model unavailable.
 */
export class OnnxTipDetector {
  private session: OrtSession | null = null;
  private ort: OrtModule | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private loading: Promise<void> | null = null;
  private readonly modelUrl: string;

  constructor(modelUrl = DEFAULT_MODEL_URL) {
    this.modelUrl = modelUrl;
  }

  async init(): Promise<boolean> {
    if (this.session) return true;
    if (this.loading) {
      await this.loading;
      return Boolean(this.session);
    }
    this.loading = this.load();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
    return Boolean(this.session);
  }

  private async load() {
    try {
      const ort = (await import("onnxruntime-web")) as unknown as OrtModule;
      // Serve WASM from CDN if bundler doesn't copy assets.
      ort.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
      ort.env.wasm.numThreads = 1;
      this.ort = ort;
      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ["wasm"],
      });
    } catch (e) {
      console.warn("[autoscore] ONNX init failed", e);
      this.session = null;
    }
  }

  /**
   * Run detection on a video frame. Returns [] if not ready.
   */
  async detect(video: HTMLVideoElement): Promise<YoloDetection[]> {
    if (!this.session || !this.ort) return [];
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw < 16 || vh < 16) return [];

    if (!this.canvas) this.canvas = document.createElement("canvas");
    const canvas = this.canvas;
    canvas.width = IMGSZ;
    canvas.height = IMGSZ;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];

    // Letterbox to square
    const scale = IMGSZ / Math.max(vw, vh);
    const nw = Math.round(vw * scale);
    const nh = Math.round(vh * scale);
    const padX = Math.floor((IMGSZ - nw) / 2);
    const padY = Math.floor((IMGSZ - nh) / 2);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, IMGSZ, IMGSZ);
    ctx.drawImage(video, padX, padY, nw, nh);

    const { data } = ctx.getImageData(0, 0, IMGSZ, IMGSZ);
    const float = new Float32Array(3 * IMGSZ * IMGSZ);
    // NCHW RGB /255
    let i = 0;
    for (let y = 0; y < IMGSZ; y++) {
      for (let x = 0; x < IMGSZ; x++) {
        const p = (y * IMGSZ + x) * 4;
        float[i] = data[p]! / 255;
        float[IMGSZ * IMGSZ + i] = data[p + 1]! / 255;
        float[2 * IMGSZ * IMGSZ + i] = data[p + 2]! / 255;
        i++;
      }
    }

    const inputName = this.session.inputNames[0]!;
    const tensor = new this.ort.Tensor("float32", float, [1, 3, IMGSZ, IMGSZ]);
    const out = await this.session.run({ [inputName]: tensor });
    const outName = this.session.outputNames[0]!;
    const result = out[outName]!;
    const dets = decodeYoloV8(result.data, result.dims, { imgsz: IMGSZ });

    // Map letterbox coords back to full-frame normalized
    return dets.map((d) => {
      const px = d.cx * IMGSZ;
      const py = d.cy * IMGSZ;
      const fx = (px - padX) / nw;
      const fy = (py - padY) / nh;
      return {
        ...d,
        cx: Math.min(1, Math.max(0, fx)),
        cy: Math.min(1, Math.max(0, fy)),
        w: (d.w * IMGSZ) / nw,
        h: (d.h * IMGSZ) / nh,
      };
    });
  }

  dispose() {
    this.session = null;
    this.ort = null;
  }
}
