import Foundation
import CoreML
import CoreVideo
import CoreImage
import ARKit
import UIKit
import simd

/// Dedicated YOLO (`board` class) → image circle for H. Tip scoring stays on DartSense.
final class BoardDiskScorer {
    private var model: BoardDisk?
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private var workBuffer: CVPixelBuffer?
    private(set) var statusLine = "board:init"
    private(set) var isModelLoaded = false
    private var lastInferAt: TimeInterval = 0
    private var lastGoodAt: TimeInterval = 0
    private let inferInterval: TimeInterval = 0.08
    private let confThresh: Float = 0.42
    /// Last good detection — returned during throttle so calib streak does not fall through to RGB.
    private(set) var lastHit: Hit?

    init() {
        loadModel()
    }

    private func loadModel() {
        do {
            let cfg = MLModelConfiguration()
            cfg.computeUnits = .all
            model = try BoardDisk(configuration: cfg)
            isModelLoaded = true
            statusLine = "board:ready"
        } catch {
            statusLine = "board:load_err \(error.localizedDescription)"
            isModelLoaded = false
            model = nil
        }
    }

    struct Hit {
        var imageX: Float
        var imageY: Float
        var radiusPx: Float
        var conf: Float
    }

    func detect(frame: ARFrame) -> Hit? {
        guard let model else { return nil }
        // Keep last hit warm during throttle so LidarSession does not drop to RGB.
        if frame.timestamp - lastInferAt < inferInterval {
            return lastHit
        }
        lastInferAt = frame.timestamp

        let src = frame.capturedImage
        let srcW = Float(CVPixelBufferGetWidth(src))
        let srcH = Float(CVPixelBufferGetHeight(src))
        let side = min(srcW, srcH)
        let origin = SIMD2((srcW - side) * 0.5, (srcH - side) * 0.5)

        guard let input = makeSquareCrop640(from: src, origin: origin, side: side) else {
            statusLine = "board:resize_fail"
            return lastHit
        }

        let prediction: BoardDiskOutput
        do {
            prediction = try model.prediction(
                image: input,
                iouThreshold: 0.45,
                confidenceThreshold: 0.22
            )
        } catch {
            statusLine = "board:pred_err"
            return lastHit
        }

        guard let best = decodeBest(
            confidence: prediction.confidence,
            coordinates: prediction.coordinates
        ) else {
            statusLine = "board:no_det"
            if lastHit != nil, frame.timestamp - lastGoodAt > 1.2 {
                lastHit = nil
                return nil
            }
            return lastHit
        }

        // coordinates are relative 0–1 to 640 crop.
        // YOLO box often wraps the full cork (numbers); scoring face ≈ 170/200 of that.
        let scale = side
        let cx = origin.x + best.cx * scale
        let cy = origin.y + best.cy * scale
        let boxR = min(best.w, best.h) * 0.5 * scale
        let r = boxR * 0.86
        let minSide = min(srcW, srcH)
        guard r > minSide * 0.10, r < minSide * 0.38 else {
            statusLine = "board:r_bad \(Int(r))"
            return lastHit
        }
        statusLine = "board:ok conf=\(String(format: "%.2f", best.conf)) r=\(Int(r))"
        let hit = Hit(imageX: cx, imageY: cy, radiusPx: r, conf: best.conf)
        lastHit = hit
        lastGoodAt = frame.timestamp
        return hit
    }

    private struct RawDet {
        var cx: Float
        var cy: Float
        var w: Float
        var h: Float
        var conf: Float
    }

    private func decodeBest(
        confidence: MLMultiArray,
        coordinates: MLMultiArray
    ) -> RawDet? {
        let n = confidence.shape[0].intValue
        guard n > 0,
              coordinates.shape[0].intValue == n,
              coordinates.shape[1].intValue >= 4
        else { return nil }

        let confPtr = confidence.dataPointer.bindMemory(to: Float.self, capacity: n)
        let coordPtr = coordinates.dataPointer.bindMemory(to: Float.self, capacity: n * 4)
        var best: RawDet?
        for i in 0..<n {
            // confidence is N×1 for single class (or N×C)
            let c: Float
            if confidence.shape.count > 1, confidence.shape[1].intValue > 1 {
                c = confPtr[i * confidence.shape[1].intValue]
            } else {
                c = confPtr[i]
            }
            guard c >= confThresh else { continue }
            let cx = coordPtr[i * 4 + 0]
            let cy = coordPtr[i * 4 + 1]
            let w = coordPtr[i * 4 + 2]
            let h = coordPtr[i * 4 + 3]
            if best == nil || c > best!.conf {
                best = RawDet(cx: cx, cy: cy, w: w, h: h, conf: c)
            }
        }
        return best
    }

    private func makeSquareCrop640(
        from src: CVPixelBuffer,
        origin: SIMD2<Float>,
        side: Float
    ) -> CVPixelBuffer? {
        if workBuffer == nil {
            var buf: CVPixelBuffer?
            let attrs: [String: Any] = [
                kCVPixelBufferCGImageCompatibilityKey as String: true,
                kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
                kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
            ]
            CVPixelBufferCreate(
                kCFAllocatorDefault, 640, 640,
                kCVPixelFormatType_32BGRA,
                attrs as CFDictionary,
                &buf
            )
            workBuffer = buf
        }
        guard let dst = workBuffer else { return nil }
        let srcH = Float(CVPixelBufferGetHeight(src))
        let ci = CIImage(cvPixelBuffer: src)
        // CIImage is bottom-left origin; the 640² render maps CI top → buffer row 0,
        // so only the crop rect's Y needs converting — no flip (that mirrored detections).
        let cropRect = CGRect(
            x: CGFloat(origin.x), y: CGFloat(srcH - origin.y - side),
            width: CGFloat(side), height: CGFloat(side)
        )
        let cropped = ci.cropped(to: cropRect)
            .transformed(by: CGAffineTransform(
                translationX: -cropRect.origin.x, y: -cropRect.origin.y
            ))
        let s = 640.0 / CGFloat(side)
        let scaled = cropped.transformed(by: CGAffineTransform(scaleX: s, y: s))
            .composited(over: CIImage(color: .black).cropped(
                to: CGRect(x: 0, y: 0, width: 640, height: 640)
            ))
        ciContext.render(
            scaled, to: dst,
            bounds: CGRect(x: 0, y: 0, width: 640, height: 640),
            colorSpace: CGColorSpaceCreateDeviceRGB()
        )
        return dst
    }
}
