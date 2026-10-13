import Foundation
import ARKit
import CoreVideo
import UIKit

/// Board lock for wood-backed boards (no red surround mat).
/// Primary: dark/colored scoring face on light wood. Fallback: red surround annulus.
enum BullDetector {
    struct Hit {
        var viewPoint: CGPoint
        var imageX: Float
        var imageY: Float
        var redPixels: Int
        var estimatedBoardRadiusPx: Float
        var source: String
    }

    private(set) static var lastRedCount = 0
    private(set) static var lastBlobCount = 0
    private(set) static var lastSurroundPx = 0
    private(set) static var lastReject = ""
    private(set) static var lastSource = ""

    static func findBull(
        frame: ARFrame,
        viewSize: CGSize,
        orientation: UIInterfaceOrientation
    ) -> Hit? {
        lastRedCount = 0
        lastBlobCount = 0
        lastSurroundPx = 0
        lastReject = ""
        lastSource = ""
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

        let target = 320
        let scale = min(1, Float(target) / Float(max(fullW, fullH)))
        let w = max(16, Int((Float(fullW) * scale).rounded()))
        let h = max(16, Int((Float(fullH) * scale).rounded()))
        let area = w * h
        let minSideFull = Float(min(fullW, fullH))

        var face = [Bool](repeating: false, count: area)
        var faceCount = 0
        var surround = [Bool](repeating: false, count: area)
        var surroundCount = 0
        var bullMask = [Bool](repeating: false, count: area)
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
                let chroma = max(r, max(g, b)) - min(r, min(g, b))

                // Pale wood backboard — exclude from scoring-face mask.
                let isWood = y > 125 && chroma < 42 && r > 100 && g > 90 && b > 70
                // Board face: black spider / wires / colored segments (not wood, not floor).
                let isFace = !isWood && (y < 115 || chroma > 28) && y > 18 && y < 210
                if isFace {
                    face[yy * w + xx] = true
                    faceCount += 1
                }

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
        lastSurroundPx = faceCount
        lastRedCount = bullCount

        if let hit = fitCircle(
            mask: face,
            count: faceCount,
            w: w,
            h: h,
            scale: scale,
            fullW: fullW,
            fullH: fullH,
            minSideFull: minSideFull,
            bullMask: bullMask,
            frame: frame,
            viewSize: viewSize,
            orientation: orientation,
            source: "dark",
            // Face OD ≈ outer double; no 170/225 shrink.
            radiusScale: 1.0,
            maxFrac: 0.38,
            minFrac: 0.04
        ) {
            lastSource = "dark"
            return hit
        }

        // Fallback: classic red surround mat (annulus).
        lastSurroundPx = surroundCount
        if let hit = fitRedAnnulus(
            surround: surround,
            surroundCount: surroundCount,
            bullMask: bullMask,
            w: w,
            h: h,
            scale: scale,
            fullW: fullW,
            fullH: fullH,
            minSideFull: minSideFull,
            frame: frame,
            viewSize: viewSize,
            orientation: orientation
        ) {
            lastSource = "red"
            return hit
        }

        if lastReject.isEmpty { lastReject = "no_face_no_red" }
        return nil
    }

    // MARK: - Dark / colored face → circle

    private static func fitCircle(
        mask: [Bool],
        count: Int,
        w: Int,
        h: Int,
        scale: Float,
        fullW: Int,
        fullH: Int,
        minSideFull: Float,
        bullMask: [Bool],
        frame: ARFrame,
        viewSize: CGSize,
        orientation: UIInterfaceOrientation,
        source: String,
        radiusScale: Float,
        maxFrac: Float,
        minFrac: Float
    ) -> Hit? {
        let area = w * h
        let frac = Float(count) / Float(area)
        guard frac >= minFrac, frac <= maxFrac else {
            lastReject = "\(source)_frac=\(String(format: "%.2f", frac))"
            return nil
        }

        // Largest 4-connected component.
        var visited = [Bool](repeating: false, count: area)
        var bestIdxs: [Int] = []
        for i in 0..<area where mask[i] && !visited[i] {
            var q = [i]
            visited[i] = true
            var qi = 0
            var idxs: [Int] = []
            while qi < q.count {
                let cur = q[qi]; qi += 1
                idxs.append(cur)
                let px = cur % w
                let py = cur / w
                for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                    let nx = px + dx, ny = py + dy
                    guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
                    let j = ny * w + nx
                    if mask[j], !visited[j] {
                        visited[j] = true
                        q.append(j)
                    }
                }
            }
            if idxs.count > bestIdxs.count { bestIdxs = idxs }
        }
        lastBlobCount = 1
        guard bestIdxs.count > area / 40 else {
            lastReject = "\(source)_blob_small n=\(bestIdxs.count)"
            return nil
        }

        var sumX: Float = 0, sumY: Float = 0
        var minX = w, maxX = 0, minY = h, maxY = 0
        for i in bestIdxs {
            let x = i % w
            let y = i / w
            sumX += Float(x); sumY += Float(y)
            minX = min(minX, x); maxX = max(maxX, x)
            minY = min(minY, y); maxY = max(maxY, y)
        }
        let n = Float(bestIdxs.count)
        var cx = sumX / n
        var cy = sumY / n
        let bw = maxX - minX + 1
        let bh = maxY - minY + 1
        let aspect = Float(max(bw, bh)) / Float(max(1, min(bw, bh)))
        guard aspect < 1.35 else {
            lastReject = "\(source)_aspect=\(String(format: "%.2f", aspect))"
            return nil
        }

        // Radius = robust outer extent (90th percentile of distances) — not bbox/2.
        var dists = bestIdxs.map { i -> Float in
            let x = Float(i % w) - cx
            let y = Float(i / w) - cy
            return hypot(x, y)
        }
        dists.sort()
        let p90 = dists[min(dists.count - 1, Int(Float(dists.count) * 0.90))]
        var r = p90

        // Refine center: mean of pixels in outer shell (ring), then recompute p90.
        let shellLo = r * 0.72
        var sx: Float = 0, sy: Float = 0, sn: Float = 0
        for i in bestIdxs {
            let x = Float(i % w)
            let y = Float(i / w)
            let d = hypot(x - cx, y - cy)
            guard d >= shellLo else { continue }
            sx += x; sy += y; sn += 1
        }
        if sn > 30 {
            cx = sx / sn
            cy = sy / sn
            dists = bestIdxs.map { i -> Float in
                hypot(Float(i % w) - cx, Float(i / w) - cy)
            }
            dists.sort()
            r = dists[min(dists.count - 1, Int(Float(dists.count) * 0.90))]
        }

        // Nudge toward tiny red bull if present near center.
        if let (bx, by, bn) = findBullNear(
            bullMask: bullMask, w: w, h: h, cx: cx, cy: cy, maxDist: r * 0.22
        ), bn >= 3 {
            cx = cx * 0.7 + bx * 0.3
            cy = cy * 0.7 + by * 0.3
            lastRedCount = bn
        }

        var boardR = (r / scale) * radiusScale
        // Typical board fills ~18–32% of short side from tripod — reject absurd sizes.
        let minR = minSideFull * 0.12
        let maxR = minSideFull * 0.34
        if boardR < minR || boardR > maxR {
            lastReject =
                "\(source)_r=\(Int(boardR)) clamp[\(Int(minR)),\(Int(maxR))]"
            return nil
        }

        return makeHit(
            cx: cx, cy: cy, boardR: boardR, w: w, h: h,
            fullW: fullW, fullH: fullH,
            frame: frame, viewSize: viewSize, orientation: orientation,
            redPixels: lastRedCount, source: source
        )
    }

    private static func fitRedAnnulus(
        surround: [Bool],
        surroundCount: Int,
        bullMask: [Bool],
        w: Int,
        h: Int,
        scale: Float,
        fullW: Int,
        fullH: Int,
        minSideFull: Float,
        frame: ARFrame,
        viewSize: CGSize,
        orientation: UIInterfaceOrientation
    ) -> Hit? {
        let area = w * h
        let frac = Float(surroundCount) / Float(area)
        guard frac >= 0.012, frac <= 0.35 else {
            lastReject = "red_frac=\(String(format: "%.2f", frac))"
            return nil
        }

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
            lastReject = "red_bbox_small"
            return nil
        }
        var scx = Float(minX + maxX) * 0.5
        var scy = Float(minY + maxY) * 0.5
        var bboxR = Float(max(bw, bh)) * 0.5

        var ringCount = 0
        var rMinX = w, rMaxX = 0, rMinY = h, rMaxY = 0
        let rIn = bboxR * 0.70
        let rOut = bboxR * 1.05
        for i in 0..<area where surround[i] {
            let x = i % w
            let y = i / w
            let d = hypot(Float(x) - scx, Float(y) - scy)
            guard d >= rIn, d <= rOut else { continue }
            ringCount += 1
            rMinX = min(rMinX, x); rMaxX = max(rMaxX, x)
            rMinY = min(rMinY, y); rMaxY = max(rMaxY, y)
        }
        guard ringCount > 80 else {
            lastReject = "red_ring_n=\(ringCount)"
            return nil
        }
        scx = Float(rMinX + rMaxX) * 0.5
        scy = Float(rMinY + rMaxY) * 0.5
        bboxR = Float(max(rMaxX - rMinX + 1, rMaxY - rMinY + 1)) * 0.5
        lastSurroundPx = ringCount

        // Surround OD → outer double.
        var boardR = (bboxR / scale) * (170.0 / 225.0)
        let minR = minSideFull * 0.12
        let maxR = minSideFull * 0.34
        guard boardR >= minR, boardR <= maxR else {
            lastReject = "red_r=\(Int(boardR))"
            return nil
        }

        if let (bx, by, bn) = findBullNear(
            bullMask: bullMask, w: w, h: h, cx: scx, cy: scy, maxDist: bboxR * 0.2
        ), bn >= 3 {
            scx = scx * 0.65 + bx * 0.35
            scy = scy * 0.65 + by * 0.35
            lastRedCount = bn
        }

        return makeHit(
            cx: scx, cy: scy, boardR: boardR, w: w, h: h,
            fullW: fullW, fullH: fullH,
            frame: frame, viewSize: viewSize, orientation: orientation,
            redPixels: lastRedCount, source: "red"
        )
    }

    private static func findBullNear(
        bullMask: [Bool],
        w: Int,
        h: Int,
        cx: Float,
        cy: Float,
        maxDist: Float
    ) -> (Float, Float, Int)? {
        let area = w * h
        var visited = [Bool](repeating: false, count: area)
        var best: (Float, Float, Int, Float)?
        for y in 0..<h {
            for x in 0..<w {
                let start = y * w + x
                guard bullMask[start], !visited[start] else { continue }
                var q = [start]
                visited[start] = true
                var qi = 0
                var sumX: Float = 0, sumY: Float = 0, n = 0
                while qi < q.count {
                    let i = q[qi]; qi += 1
                    let px = i % w
                    let py = i / w
                    sumX += Float(px); sumY += Float(py); n += 1
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
                guard n >= 3, n <= max(12, area / 600) else { continue }
                let bx = sumX / Float(n)
                let by = sumY / Float(n)
                let d = hypot(bx - cx, by - cy)
                guard d <= maxDist else { continue }
                let score = d
                if best == nil || score < best!.3 {
                    best = (bx, by, Int(n), score)
                }
            }
        }
        guard let b = best else { return nil }
        return (b.0, b.1, b.2)
    }

    private static func makeHit(
        cx: Float,
        cy: Float,
        boardR: Float,
        w: Int,
        h: Int,
        fullW: Int,
        fullH: Int,
        frame: ARFrame,
        viewSize: CGSize,
        orientation: UIInterfaceOrientation,
        redPixels: Int,
        source: String
    ) -> Hit {
        let imageX = cx / Float(w) * Float(fullW)
        let imageY = cy / Float(h) * Float(fullH)
        let nx = CGFloat(cx / Float(w))
        let ny = CGFloat(cy / Float(h))
        let display = frame.displayTransform(for: orientation, viewportSize: viewSize)
        let p = CGPoint(x: nx, y: ny).applying(display)
        let viewPt = CGPoint(
            x: min(max(p.x * viewSize.width, 0), viewSize.width),
            y: min(max(p.y * viewSize.height, 0), viewSize.height)
        )
        return Hit(
            viewPoint: viewPt,
            imageX: imageX,
            imageY: imageY,
            redPixels: redPixels,
            estimatedBoardRadiusPx: boardR,
            source: source
        )
    }
}
