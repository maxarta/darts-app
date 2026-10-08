import Foundation
import simd
import ARKit
import CoreVideo

/// Tip finder vs a working board snapshot.
/// `visitEmpty` = truly empty board (for removal); `empty` = last settled board (for next dart).
final class RgbMotionDetector {
    private var emptyY: [UInt8]?
    private var visitEmptyY: [UInt8]?
    private var emptyW = 0
    private var emptyH = 0
    private var lastHitAt: TimeInterval = 0
    private var pendingX: Float = 0
    private var pendingY: Float = 0
    private var pendingFrames = 0
    private var hasEmpty = false
    private var boardRadiusPx: Float = 200
    private var imageLongSide: Float = 1920

    private let threshold: Int = 24
    private let cooldown: TimeInterval = 1.0
    private let agreeFrames = 1
    private let agreeRadiusPx: Float = 24

    struct TipHit {
        var imageX: Float
        var imageY: Float
        var energy: Float
        var pixelCount: Int
        var radialNorm: Float
    }

    private(set) var lastMotionPixels: Int = 0
    private(set) var lastVisitMotionPixels: Int = 0

    func reset() {
        emptyY = nil
        visitEmptyY = nil
        emptyW = 0
        emptyH = 0
        lastHitAt = 0
        pendingFrames = 0
        hasEmpty = false
        lastMotionPixels = 0
        lastVisitMotionPixels = 0
    }

    var hasEmptyReference: Bool { hasEmpty }

    var adaptiveMinPixels: Int {
        let scale = downsampleScale()
        let r = boardRadiusPx * scale
        let area = Float.pi * r * r
        return max(5, min(50, Int(area * 0.005)))
    }

    /// Alias used by legacy DartScorer — same as visit-empty snapshot.
    func captureEmpty(frame: ARFrame, calib: BoardImageCalibration) {
        captureVisitEmpty(frame: frame, calib: calib)
    }

    /// Capture visit-start empty (also becomes working baseline).
    func captureVisitEmpty(frame: ARFrame, calib: BoardImageCalibration) {
        boardRadiusPx = calib.radiusPx
        imageLongSide = max(calib.imageWidth, calib.imageHeight)
        guard let gray = downsampleY(frame: frame) else { return }
        emptyY = gray.pixels
        visitEmptyY = gray.pixels
        emptyW = gray.w
        emptyH = gray.h
        hasEmpty = true
        pendingFrames = 0
        lastMotionPixels = 0
        lastVisitMotionPixels = 0
    }

    /// After a dart sticks — new baseline so the next throw is a fresh diff.
    func captureWorkingBaseline(frame: ARFrame, calib: BoardImageCalibration) {
        boardRadiusPx = calib.radiusPx
        imageLongSide = max(calib.imageWidth, calib.imageHeight)
        guard let gray = downsampleY(frame: frame) else { return }
        guard gray.w == emptyW, gray.h == emptyH, hasEmpty else {
            captureVisitEmpty(frame: frame, calib: calib)
            return
        }
        emptyY = gray.pixels
        pendingFrames = 0
        lastMotionPixels = 0
    }

    func peekMotionCount(frame: ARFrame, calib: BoardImageCalibration) -> Int {
        countMotion(frame: frame, calib: calib, againstVisit: false)
    }

    func peekVisitMotionCount(frame: ARFrame, calib: BoardImageCalibration) -> Int {
        countMotion(frame: frame, calib: calib, againstVisit: true)
    }

    private func countMotion(
        frame: ARFrame,
        calib: BoardImageCalibration,
        againstVisit: Bool
    ) -> Int {
        boardRadiusPx = calib.radiusPx
        imageLongSide = max(calib.imageWidth, calib.imageHeight)
        let ref = againstVisit ? visitEmptyY : emptyY
        guard hasEmpty, let empty = ref else { return 0 }
        guard let gray = downsampleY(frame: frame) else { return 0 }
        guard gray.w == emptyW, gray.h == emptyH else { return 0 }

        let w = gray.w
        let h = gray.h
        let pixels = gray.pixels
        let cx = calib.cx * Float(w) / calib.imageWidth
        let cy = calib.cy * Float(h) / calib.imageHeight
        let r = calib.radiusPx * Float(w) / calib.imageWidth * 1.08
        let r2 = r * r
        var count = 0
        for y in 0..<h {
            for x in 0..<w {
                let dx = Float(x) - cx
                let dy = Float(y) - cy
                if dx * dx + dy * dy > r2 { continue }
                let idx = y * w + x
                if abs(Int(pixels[idx]) - Int(empty[idx])) >= threshold {
                    count += 1
                }
            }
        }
        if againstVisit {
            lastVisitMotionPixels = count
        } else {
            lastMotionPixels = count
        }
        return count
    }

    func analyze(
        frame: ARFrame,
        calib: BoardImageCalibration,
        now: TimeInterval,
        minPixelsOverride: Int? = nil
    ) -> TipHit? {
        boardRadiusPx = calib.radiusPx
        imageLongSide = max(calib.imageWidth, calib.imageHeight)
        guard hasEmpty, let empty = emptyY else { return nil }
        guard let gray = downsampleY(frame: frame) else { return nil }
        guard gray.w == emptyW, gray.h == emptyH else {
            hasEmpty = false
            return nil
        }

        if now - lastHitAt < cooldown {
            pendingFrames = 0
            return nil
        }

        let w = gray.w
        let h = gray.h
        let pixels = gray.pixels
        let cx = calib.cx * Float(w) / calib.imageWidth
        let cy = calib.cy * Float(h) / calib.imageHeight
        let r = calib.radiusPx * Float(w) / calib.imageWidth * 1.08
        let r2 = r * r
        let need = minPixelsOverride ?? adaptiveMinPixels

        var bestX = 0
        var bestY = 0
        var bestDiff = 0
        var sumX: Float = 0
        var sumY: Float = 0
        var sumW: Float = 0
        var count = 0
        var energy: Float = 0

        for y in 0..<h {
            for x in 0..<w {
                let dx = Float(x) - cx
                let dy = Float(y) - cy
                let rad2 = dx * dx + dy * dy
                if rad2 > r2 { continue }
                let idx = y * w + x
                let d = abs(Int(pixels[idx]) - Int(empty[idx]))
                if d < threshold { continue }
                count += 1
                let wf = Float(d)
                energy += wf
                sumX += Float(x) * wf
                sumY += Float(y) * wf
                sumW += wf
                if d > bestDiff {
                    bestDiff = d
                    bestX = x
                    bestY = y
                }
            }
        }

        lastMotionPixels = count
        guard count >= need, sumW > 0 else {
            pendingFrames = 0
            return nil
        }

        let tipX = Float(bestX) * 0.55 + (sumX / sumW) * 0.45
        let tipY = Float(bestY) * 0.55 + (sumY / sumW) * 0.45

        if pendingFrames > 0 {
            let jump = hypot(tipX - pendingX, tipY - pendingY)
            if jump <= agreeRadiusPx {
                pendingFrames += 1
                pendingX = (pendingX + tipX) * 0.5
                pendingY = (pendingY + tipY) * 0.5
            } else {
                pendingX = tipX
                pendingY = tipY
                pendingFrames = 1
            }
        } else {
            pendingX = tipX
            pendingY = tipY
            pendingFrames = 1
        }

        guard pendingFrames >= agreeFrames else { return nil }

        lastHitAt = now
        pendingFrames = 0

        let fullW = CVPixelBufferGetWidth(frame.capturedImage)
        let fullH = CVPixelBufferGetHeight(frame.capturedImage)
        let rad = hypot(pendingX - cx, pendingY - cy)
        return TipHit(
            imageX: pendingX / Float(w) * Float(fullW),
            imageY: pendingY / Float(h) * Float(fullH),
            energy: energy,
            pixelCount: count,
            radialNorm: rad / max(r, 1)
        )
    }

    private struct Gray {
        var pixels: [UInt8]
        var w: Int
        var h: Int
    }

    private func downsampleScale() -> Float {
        let wantR: Float = 80
        let byBoard = boardRadiusPx > 1 ? wantR / boardRadiusPx : 0.25
        let byLong = 480 / max(imageLongSide, 1)
        return min(1, max(byBoard, byLong, 200 / max(imageLongSide, 1)))
    }

    private func downsampleY(frame: ARFrame) -> Gray? {
        let buffer = frame.capturedImage
        let fullW = CVPixelBufferGetWidth(buffer)
        let fullH = CVPixelBufferGetHeight(buffer)
        guard fullW > 16, fullH > 16 else { return nil }

        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, 0) else { return nil }
        let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
        let src = base.assumingMemoryBound(to: UInt8.self)

        let scale = downsampleScale()
        let w = max(8, Int((Float(fullW) * scale).rounded()))
        let h = max(8, Int((Float(fullH) * scale).rounded()))

        var pixels = [UInt8](repeating: 0, count: w * h)
        for y in 0..<h {
            let sy = min(fullH - 1, Int((Float(y) / Float(h) * Float(fullH)).rounded()))
            for x in 0..<w {
                let sx = min(fullW - 1, Int((Float(x) / Float(w) * Float(fullW)).rounded()))
                pixels[y * w + x] = src[sy * bytesPerRow + sx]
            }
        }
        return Gray(pixels: pixels, w: w, h: h)
    }
}
