import Foundation

/// Dart-sense board-plane homography (center 0.5,0.5; outer double r = 170/451).
/// Port of `lib/autoscore/homography.ts` + `boardplane-score.ts`.
enum BoardHomography {
    struct Point2: Equatable {
        var x: Float
        var y: Float
    }

    /// 3×3 row-major, h22 = 1.
    typealias Matrix = (Float, Float, Float, Float, Float, Float, Float, Float, Float)

    static let outerDoubleR: Float = 170.0 / 451.0

    /// Targets: 0=20, 1=3, 2=11, 3=6, 4=9, 5=15 (dart-sense / get_scores.py).
    static let calibTargets: [Point2] = {
        let h = outerDoubleR
        func pair(_ deg: Float) -> (Point2, Point2) {
            let a = h * cos(deg * .pi / 180)
            let o = sqrt(max(0, h * h - a * a))
            // Matches get_scores.py signs for each pair.
            return (Point2(x: 0.5 - a, y: 0.5 - o), Point2(x: 0.5 + a, y: 0.5 + o))
        }
        let p20 = pair(81) // 20 & 3
        let a11 = h * cos(Float(-9) * .pi / 180)
        let o11 = sqrt(max(0, h * h - a11 * a11))
        let a9 = h * cos(Float(27) * .pi / 180)
        let o9 = sqrt(max(0, h * h - a9 * a9))
        return [
            p20.0, // 20
            p20.1, // 3
            Point2(x: 0.5 - a11, y: 0.5 + o11), // 11
            Point2(x: 0.5 + a11, y: 0.5 - o11), // 6
            Point2(x: 0.5 - a9, y: 0.5 - o9), // 9
            Point2(x: 0.5 + a9, y: 0.5 + o9), // 15
        ]
    }()

    /// Homography from any ≥4 of the 6 calib slots.
    static func fromCalib(_ detected: [Point2?]) -> Matrix? {
        var src: [Point2] = []
        var dst: [Point2] = []
        let n = min(detected.count, calibTargets.count)
        for i in 0..<n {
            guard let d = detected[i],
                  d.x >= 0, d.x <= 1, d.y >= 0, d.y <= 1
            else { continue }
            src.append(d)
            dst.append(calibTargets[i])
        }
        guard src.count >= 4 else { return nil }
        return findHomography(src: Array(src.prefix(4)), dst: Array(dst.prefix(4)))
    }

    /// Fill missing slots via similarity from ≥2 known detections (boardplane → image).
    static func completeCalib(_ detected: [Point2?]) -> [Point2?] {
        var out: [Point2?] = (0..<6).map { i in
            i < detected.count ? detected[i] : nil
        }
        var idxs: [Int] = []
        for i in 0..<6 where out[i] != nil { idxs.append(i) }
        guard idxs.count >= 2,
              let s0 = out[idxs[0]], let s1 = out[idxs[1]]
        else { return out }
        let d0 = calibTargets[idxs[0]], d1 = calibTargets[idxs[1]]
        let vx = d1.x - d0.x, vy = d1.y - d0.y
        let wx = s1.x - s0.x, wy = s1.y - s0.y
        let vLen = hypot(vx, vy)
        let wLen = hypot(wx, wy)
        guard vLen > 1e-4, wLen > 1e-4 else { return out }
        let scale = wLen / vLen
        let ang = atan2(wy, wx) - atan2(vy, vx)
        let ca = cos(ang), sa = sin(ang)

        for i in 0..<6 where out[i] == nil {
            let p = calibTargets[i]
            let dx = p.x - d0.x, dy = p.y - d0.y
            let rx = (ca * dx - sa * dy) * scale
            let ry = (sa * dx + ca * dy) * scale
            let m = Point2(x: s0.x + rx, y: s0.y + ry)
            if m.x >= -0.05, m.x <= 1.05, m.y >= -0.05, m.y <= 1.05 {
                out[i] = Point2(x: min(1, max(0, m.x)), y: min(1, max(0, m.y)))
            }
        }
        return out
    }

    static func apply(_ H: Matrix, _ p: Point2) -> Point2 {
        let w = H.6 * p.x + H.7 * p.y + H.8
        guard abs(w) > 1e-12 else { return p }
        return Point2(
            x: (H.0 * p.x + H.1 * p.y + H.2) / w,
            y: (H.3 * p.x + H.4 * p.y + H.5) / w
        )
    }

    static func findHomography(src: [Point2], dst: [Point2]) -> Matrix? {
        guard src.count >= 4, dst.count >= 4 else { return nil }
        var A = [[Float]](repeating: [Float](repeating: 0, count: 8), count: 8)
        var b = [Float](repeating: 0, count: 8)
        for i in 0..<4 {
            let x = src[i].x, y = src[i].y
            let u = dst[i].x, v = dst[i].y
            A[i * 2] = [x, y, 1, 0, 0, 0, -u * x, -u * y]
            b[i * 2] = u
            A[i * 2 + 1] = [0, 0, 0, x, y, 1, -v * x, -v * y]
            b[i * 2 + 1] = v
        }
        guard let h = solve8(A, b) else { return nil }
        return (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1)
    }

    // MARK: - Score (dart-sense board plane)

    private static let scoringRadii: [Float] = {
        let ring: Float = 10
        let bullWire: Float = 1.6
        var r: [Float] = [0, 6.35, 15.9, 107.4 - ring, 107.4, 170 - ring, 170]
        r[1] += bullWire / 2
        r[2] += bullWire / 2
        return r.map { $0 / 451 }
    }()

    private static let scoringNames = ["DB", "SB", "S", "T", "S", "D", "miss"]
    private static let segmentAngles: [Float] = [-9, 9, 27, 45, 63, -81, -63, -45, -27]
    private static let segmentPairs: [[Int]] = [
        [6, 11], [10, 14], [15, 9], [2, 12], [17, 5],
        [19, 1], [7, 18], [16, 4], [8, 13],
    ]

    static func scoreBoardPlane(_ p: Point2) -> NativeThrowInput {
        var x = p.x
        var y = p.y
        if x == 0.5 { x += 1e-5 }

        var angle = atan((y - 0.5) / (x - 0.5)) * 180 / .pi
        angle = angle > 0 ? floor(angle) : ceil(angle)

        let possible: [Int]
        if abs(angle) >= 81 {
            possible = [3, 20]
        } else {
            let eligible = segmentAngles.filter { $0 <= angle }
            let best = eligible.max() ?? -9
            let idx = segmentAngles.firstIndex(of: best) ?? 0
            possible = segmentPairs[idx]
        }

        let number: Int
        if possible[0] == 6 && possible[1] == 11 {
            number = x > 0.5 ? possible[0] : possible[1]
        } else {
            number = y > 0.5 ? possible[0] : possible[1]
        }

        let distance = hypot(x - 0.5, y - 0.5)
        var regionIdx = 0
        for i in 0..<scoringRadii.count where distance > scoringRadii[i] {
            regionIdx = i
        }
        let region = scoringNames[regionIdx]

        switch region {
        case "DB":
            return NativeThrowInput(segment: .bull50, multiplier: 1, confidence: 0.9)
        case "SB":
            return NativeThrowInput(segment: .bull25, multiplier: 1, confidence: 0.85)
        case "miss":
            return NativeThrowInput(segment: .miss, multiplier: 1, confidence: 0.55)
        case "T":
            return NativeThrowInput(segment: .number(number), multiplier: 3, confidence: 0.8)
        case "D":
            return NativeThrowInput(segment: .number(number), multiplier: 2, confidence: 0.8)
        default:
            return NativeThrowInput(segment: .number(number), multiplier: 1, confidence: 0.75)
        }
    }

    /// Bull + outer-double radius in crop-normalized space from ≥2 calib points.
    static func circleFromCalib(_ pts: [Point2]) -> (cx: Float, cy: Float, r: Float)? {
        guard pts.count >= 2 else { return nil }
        let n = Float(pts.count)
        let cx = pts.map(\.x).reduce(0, +) / n
        let cy = pts.map(\.y).reduce(0, +) / n
        let r = pts.map { hypot($0.x - cx, $0.y - cy) }.reduce(0, +) / n
        guard r > 0.08, r < 0.55 else { return nil }
        return (cx, cy, r)
    }

    private static func solve8(_ AIn: [[Float]], _ bIn: [Float]) -> [Float]? {
        let n = 8
        var M = AIn.enumerated().map { i, row in row + [bIn[i]] }
        for col in 0..<n {
            var pivot = col
            for r in (col + 1)..<n {
                if abs(M[r][col]) > abs(M[pivot][col]) { pivot = r }
            }
            if abs(M[pivot][col]) < 1e-12 { return nil }
            if pivot != col { M.swapAt(col, pivot) }
            let div = M[col][col]
            for c in col...n { M[col][c] /= div }
            for r in 0..<n where r != col {
                let f = M[r][col]
                for c in col...n { M[r][c] -= f * M[col][c] }
            }
        }
        return M.map { $0[n] }
    }
}
