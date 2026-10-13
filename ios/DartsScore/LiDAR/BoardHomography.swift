import Foundation
import simd
import ARKit

/// Dart-sense board-plane homography (center 0.5,0.5; outer double r = 170/451).
/// Port of `lib/autoscore/homography.ts` + `boardplane-score.ts` / `get_scores.py`.
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

    /// Homography from all valid calib slots (≥4). Uses least squares when n > 4
    /// (matches OpenCV `findHomography` on the masked set in get_scores.py).
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
        return findHomography(src: src, dst: dst)
    }

    /// Primary quartet 20/3/11/6 must all be present (dart-sense / DartsMind).
    static func hasPrimaryQuartet(_ detected: [Point2?]) -> Bool {
        guard detected.count >= 4 else { return false }
        for i in 0..<4 {
            guard let d = detected[i],
                  d.x >= 0, d.x <= 1, d.y >= 0, d.y <= 1
            else { return false }
        }
        return true
    }

    /// Chord lengths / center sanity for 20–3 and 11–6 (reject collapsed / wrong-class blobs).
    static func primaryQuartetSane(_ detected: [Point2?]) -> Bool {
        guard hasPrimaryQuartet(detected),
              let p0 = detected[0], let p1 = detected[1],
              let p2 = detected[2], let p3 = detected[3]
        else { return false }
        let d20_3 = hypot(p1.x - p0.x, p1.y - p0.y)
        let d11_6 = hypot(p3.x - p2.x, p3.y - p2.y)
        guard d20_3 > 0.18, d11_6 > 0.18 else { return false }
        let ratio = d20_3 / d11_6
        guard ratio > 0.55, ratio < 1.85 else { return false }
        let cx = (p0.x + p1.x + p2.x + p3.x) * 0.25
        let cy = (p0.y + p1.y + p2.y + p3.y) * 0.25
        guard cx > 0.22, cx < 0.78, cy > 0.22, cy < 0.78 else { return false }
        return true
    }

    /// Mean |H(src) − dst| in normalized board space.
    static func meanReprojectionError(
        _ H: Matrix,
        src: [Point2],
        dst: [Point2]
    ) -> Float {
        guard !src.isEmpty, src.count == dst.count else { return .infinity }
        var sum: Float = 0
        for i in 0..<src.count {
            let p = apply(H, src[i])
            sum += hypot(p.x - dst[i].x, p.y - dst[i].y)
        }
        return sum / Float(src.count)
    }

    static func reprojectionErrorFromCalib(
        _ H: Matrix,
        _ detected: [Point2?]
    ) -> Float {
        var src: [Point2] = []
        var dst: [Point2] = []
        let n = min(detected.count, calibTargets.count)
        for i in 0..<n {
            guard let d = detected[i] else { continue }
            src.append(d)
            dst.append(calibTargets[i])
        }
        return meanReprojectionError(H, src: src, dst: dst)
    }

    /// Fill missing slots via similarity — kept for diagnostics; do NOT use for lock H.
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

    /// Invert 3×3 homography (h22 may be ≠ 1 after invert — apply() still divides by w).
    static func invert(_ H: Matrix) -> Matrix? {
        let a = SIMD3<Float>(H.0, H.1, H.2)
        let b = SIMD3<Float>(H.3, H.4, H.5)
        let c = SIMD3<Float>(H.6, H.7, H.8)
        let det =
            a.x * (b.y * c.z - b.z * c.y)
            - a.y * (b.x * c.z - b.z * c.x)
            + a.z * (b.x * c.y - b.y * c.x)
        guard abs(det) > 1e-12 else { return nil }
        let invDet = 1 / det
        // adjugate / det
        let i00 = (b.y * c.z - b.z * c.y) * invDet
        let i01 = (a.z * c.y - a.y * c.z) * invDet
        let i02 = (a.y * b.z - a.z * b.y) * invDet
        let i10 = (b.z * c.x - b.x * c.z) * invDet
        let i11 = (a.x * c.z - a.z * c.x) * invDet
        let i12 = (a.z * b.x - a.x * b.z) * invDet
        let i20 = (b.x * c.y - b.y * c.x) * invDet
        let i21 = (a.y * c.x - a.x * c.y) * invDet
        let i22 = (a.x * b.y - a.y * b.x) * invDet
        return (i00, i01, i02, i10, i11, i12, i20, i21, i22)
    }

    /// Exact (n=4) or least-squares (n>4) DLT with h22 = 1.
    static func findHomography(src: [Point2], dst: [Point2]) -> Matrix? {
        guard src.count >= 4, src.count == dst.count else { return nil }
        let n = src.count
        var A = [[Float]](repeating: [Float](repeating: 0, count: 8), count: 2 * n)
        var b = [Float](repeating: 0, count: 2 * n)
        for i in 0..<n {
            let x = src[i].x, y = src[i].y
            let u = dst[i].x, v = dst[i].y
            A[i * 2] = [x, y, 1, 0, 0, 0, -u * x, -u * y]
            b[i * 2] = u
            A[i * 2 + 1] = [0, 0, 0, x, y, 1, -v * x, -v * y]
            b[i * 2 + 1] = v
        }
        if n == 4 {
            guard let h = solve8(A, b) else { return nil }
            return (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1)
        }
        // Normal equations (AᵀA) h = Aᵀb
        var AtA = [[Float]](repeating: [Float](repeating: 0, count: 8), count: 8)
        var Atb = [Float](repeating: 0, count: 8)
        for r in 0..<(2 * n) {
            for c in 0..<8 {
                Atb[c] += A[r][c] * b[r]
                for k in 0..<8 {
                    AtA[k][c] += A[r][k] * A[r][c]
                }
            }
        }
        guard let h = solve8(AtA, Atb) else { return nil }
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

    /// World point for a dart-sense board-plane coord (0.5,0.5 = bull; outer double = `plane.radius`).
    static func worldFromBoardCoord(_ t: Point2, plane: BoardPlane) -> SIMD3<Float> {
        let right = simd_normalize(simd_cross(plane.up, plane.normal))
        let ox = (t.x - 0.5) / outerDoubleR
        let oy = (0.5 - t.y) / outerDoubleR // board +Y down → −up in world
        return plane.center
            + right * (ox * plane.radius)
            + plane.up * (oy * plane.radius)
    }

    /// Project primary calib quartet (20/3/11/6) through LiDAR plane → image → H.
    /// Same pipeline as DartsMind; landmarks come from geometry, not YOLO.
    static func fromPlane(
        _ plane: BoardPlane,
        camera: ARCamera
    ) -> (H: Matrix, imagePts: [Point2], cropOrigin: SIMD2<Float>, cropSide: Float)? {
        let res = camera.imageResolution
        let w = Float(res.width)
        let h = Float(res.height)
        let fullSide = min(w, h)
        guard fullSide > 32 else { return nil }
        let ox = (w - fullSide) * 0.5
        let oy = (h - fullSide) * 0.5
        var detected: [Point2?] = [nil, nil, nil, nil, nil, nil]
        var imagePts: [Point2] = []
        for i in 0..<4 {
            let world = worldFromBoardCoord(calibTargets[i], plane: plane)
            guard let img = BoardImageCalibration.project(world: world, camera: camera) else {
                return nil
            }
            let nx = (img.x - ox) / fullSide
            let ny = (img.y - oy) / fullSide
            guard nx >= -0.05, nx <= 1.05, ny >= -0.05, ny <= 1.05 else { return nil }
            let p = Point2(x: min(1, max(0, nx)), y: min(1, max(0, ny)))
            detected[i] = p
            imagePts.append(Point2(x: img.x, y: img.y))
        }
        guard let H = fromCalib(detected) else { return nil }
        return (H, imagePts, SIMD2(ox, oy), fullSide)
    }

    /// Outer-double ring samples in capturedImage pixels (perspective ellipse).
    static func outerRingImagePoints(
        plane: BoardPlane,
        camera: ARCamera,
        samples: Int = 64
    ) -> [Point2] {
        var out: [Point2] = []
        out.reserveCapacity(samples)
        for i in 0..<samples {
            let ang = Float(i) / Float(samples) * Float.pi * 2
            // Board plane: 0° = up (20), clockwise like scoring.
            let bx = 0.5 + outerDoubleR * sin(ang)
            let by = 0.5 - outerDoubleR * cos(ang)
            let world = worldFromBoardCoord(Point2(x: bx, y: by), plane: plane)
            if let img = BoardImageCalibration.project(world: world, camera: camera) {
                out.append(Point2(x: img.x, y: img.y))
            }
        }
        return out
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
