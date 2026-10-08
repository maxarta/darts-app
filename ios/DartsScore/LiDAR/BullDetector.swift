import Foundation
import ARKit
import CoreVideo
import UIKit

/// Board lock via hollow red/pink surround ring (bbox center), optional tiny bull near center.
/// Rejects filled / half-frame masks that previously shifted the ring onto a red segment.
enum BullDetector {
    struct Hit {
        var viewPoint: CGPoint
        var imageX: Float
        var imageY: Float
        var redPixels: Int
        var estimatedBoardRadiusPx: Float
    }

    private(set) static var lastRedCount = 0
    private(set) static var lastBlobCount = 0
    private(set) static var lastSurroundPx = 0
    private(set) static var lastReject = ""

    static func findBull(
        frame: ARFrame,
        viewSize: CGSize,
        orientation: UIInterfaceOrientation
    ) -> Hit? {
        lastRedCount = 0
        lastBlobCount = 0
        lastSurroundPx = 0
        lastReject = ""
        let buffer = frame.capturedImage
        let fullW = CVPixelBufferGetWidth(buffer)
        let fullH = CVPixelBufferGetHeight(buffer)
        guard fullW > 32, fullH > 32 else { return nil }

        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

        guard CVPixelBufferGetPlaneCount(buffer) >= 2,
              let yBase = CVPixelBufferGetBaseAddressOfPlane(buffer, 0),
              let uvBase = CVPixelBufferGetBaseAddressOfPlane(buffer, 1)
        else { return nil }

        let yBPR = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
        let uvBPR = CVPixelBufferGetBytesPerRowOfPlane(buffer, 1)
        let yPtr = yBase.assumingMemoryBound(to: UInt8.self)
        let uvPtr = uvBase.assumingMemoryBound(to: UInt8.self)

        let target = 280
        let scale = min(1, Float(target) / Float(max(fullW, fullH)))
        let w = max(16, Int((Float(fullW) * scale).rounded()))
        let h = max(16, Int((Float(fullH) * scale).rounded()))
        let area = w * h

        var surround = [Bool](repeating: false, count: area)
        var bullMask = [Bool](repeating: false, count: area)
        var surroundCount = 0
        var bullCount = 0

        for yy in 0..<h {
            let sy = min(fullH - 1, Int((Float(yy) / Float(h) * Float(fullH)).rounded()))
            for xx in 0..<w {
                let sx = min(fullW - 1, Int((Float(xx) / Float(w) * Float(fullW)).rounded()))
                let y = Float(yPtr[sy * yBPR + sx])
                let uvIndex = (sy / 2) * uvBPR + (sx / 2) * 2
                let cb = Float(Int(uvPtr[uvIndex]) - 128)
                let cr = Float(Int(uvPtr[uvIndex + 1]) - 128)
                let r = y + 1.402 * cr
                let g = y - 0.344136 * cb - 0.714136 * cr
                let b = y + 1.772 * cb

                // Surround mat: vivid red OR magenta — NOT olive board / wood.
                // Require high chroma so board face red segments alone don't flood the mask.
                let chroma = max(r, max(g, b)) - min(r, min(g, b))
                let isSurround =
                    chroma > 55
                    && r > 110 && r > g + 25
                    && (b > 40 || cr > 30)
                    && y > 40 && y < 220
                if isSurround {
                    surround[yy * w + xx] = true
                    surroundCount += 1
                }

                let isBull =
                    r > 80 && r > g + 45 && r > b + 55
                    && b < 95 && g < 110
                    && cr > 25 && cb < 15
                    && chroma > 60
                if isBull {
                    bullMask[yy * w + xx] = true
                    bullCount += 1
                }
            }
        }
        lastSurroundPx = surroundCount
        lastRedCount = bullCount

        // ~2–22% of frame — a ring, not half the image of red segments.
        let frac = Float(surroundCount) / Float(area)
        guard frac >= 0.015, frac <= 0.22 else {
            lastReject = "surround_frac=\(String(format: "%.2f", frac))"
            return nil
        }

        // Bounding box of surround (stable vs brightness-weighted centroid).
        var minX = w, maxX = 0, minY = h, maxY = 0
        for i in 0..<area where surround[i] {
            let x = i % w
            let y = i / w
            minX = min(minX, x); maxX = max(maxX, x)
            minY = min(minY, y); maxY = max(maxY, y)
        }
        let bw = maxX - minX + 1
        let bh = maxY - minY + 1
        guard bw > 40, bh > 40 else {
            lastReject = "bbox_small"
            return nil
        }
        let aspect = Float(max(bw, bh)) / Float(max(1, min(bw, bh)))
        guard aspect < 1.55 else {
            lastReject = "bbox_aspect"
            return nil
        }

        let scx = Float(minX + maxX) * 0.5
        let scy = Float(minY + maxY) * 0.5
        let bboxR = Float(max(bw, bh)) * 0.5

        // Hollowness: inner 40% of bbox must be mostly NOT surround (ring, not filled disk).
        let innerR = bboxR * 0.40
        var innerTotal = 0
        var innerSur = 0
        let x0 = max(0, Int(scx - innerR))
        let x1 = min(w - 1, Int(scx + innerR))
        let y0 = max(0, Int(scy - innerR))
        let y1 = min(h - 1, Int(scy + innerR))
        for y in y0...y1 {
            for x in x0...x1 {
                let d = hypot(Float(x) - scx, Float(y) - scy)
                guard d <= innerR else { continue }
                innerTotal += 1
                if surround[y * w + x] { innerSur += 1 }
            }
        }
        let innerFill = innerTotal > 0 ? Float(innerSur) / Float(innerTotal) : 1
        guard innerFill < 0.28 else {
            lastReject = "not_hollow fill=\(String(format: "%.2f", innerFill))"
            return nil
        }

        // Outer double ≈ inside surround OD. Surround OD ~225mm, double 170mm.
        // BBox of ring ≈ outer diameter of surround in image.
        var boardR = (bboxR / scale) * (170.0 / 225.0)
        let minSide = Float(min(fullW, fullH))
        boardR = min(max(boardR, minSide * 0.14), minSide * 0.42)

        // Tiny bull near geometric center (optional refinement).
        let maxBullDist = bboxR * 0.18
        let maxBullPx = max(8, area / 800)
        let minBullPx = 3
        var visited = [Bool](repeating: false, count: area)
        var bestScore = Float.greatestFiniteMagnitude
        var bestCX = scx
        var bestCY = scy
        var bestN = 0
        var blobCount = 0

        for y in 0..<h {
            for x in 0..<w {
                let start = y * w + x
                guard bullMask[start], !visited[start] else { continue }
                var q = [start]
                visited[start] = true
                var qi = 0
                var sumX: Float = 0, sumY: Float = 0, n = 0
                var minBX = x, maxBX = x, minBY = y, maxBY = y
                while qi < q.count {
                    let i = q[qi]; qi += 1
                    let px = i % w
                    let py = i / w
                    sumX += Float(px); sumY += Float(py); n += 1
                    minBX = min(minBX, px); maxBX = max(maxBX, px)
                    minBY = min(minBY, py); maxBY = max(maxBY, py)
                    for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                        let nx = px + dx, ny = py + dy
                        guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
                        let j = ny * w + nx
                        if bullMask[j], !visited[j] {
                            visited[j] = true
                            q.append(j)
                        }
                    }
                }
                blobCount += 1
                guard n >= minBullPx, n <= maxBullPx else { continue }
                let bbw = maxBX - minBX + 1
                let bbh = maxBY - minBY + 1
                let asp = Float(max(bbw, bbh)) / Float(max(1, min(bbw, bbh)))
                guard asp < 2.2 else { continue }
                let bx = sumX / Float(n)
                let by = sumY / Float(n)
                let distC = hypot(bx - scx, by - scy)
                guard distC <= maxBullDist else { continue }
                let score = distC * 3 + Float(n) * 0.1
                if score < bestScore {
                    bestScore = score
                    bestCX = bx
                    bestCY = by
                    bestN = n
                }
            }
        }
        lastBlobCount = blobCount

        // Always use surround bbox center for board origin — bull only nudges slightly.
        var useCX = scx
        var useCY = scy
        if bestN >= minBullPx {
            useCX = scx * 0.65 + bestCX * 0.35
            useCY = scy * 0.65 + bestCY * 0.35
        }

        let imageX = useCX / Float(w) * Float(fullW)
        let imageY = useCY / Float(h) * Float(fullH)

        let nx = CGFloat(useCX / Float(w))
        let ny = CGFloat(useCY / Float(h))
        let display = frame.displayTransform(for: orientation, viewportSize: viewSize)
        var p = CGPoint(x: nx, y: ny).applying(display)
        let viewPt = CGPoint(
            x: min(max(p.x * viewSize.width, 0), viewSize.width),
            y: min(max(p.y * viewSize.height, 0), viewSize.height)
        )

        return Hit(
            viewPoint: viewPt,
            imageX: imageX,
            imageY: imageY,
            redPixels: bestN,
            estimatedBoardRadiusPx: boardR
        )
    }
}
