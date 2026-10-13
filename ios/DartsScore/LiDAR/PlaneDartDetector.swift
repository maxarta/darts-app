import Foundation
import ARKit
import simd

/// Dart finder on the LiDAR-rectified board (frontal, 20 up).
/// Averaged empty vs averaged current unwrap → diff → fragments merged along the
/// dart axis → tip = axis end on the board side (flights project away from the
/// camera's foot point on the plane).
final class PlaneDartDetector {
    /// Unwrap resolution; board coords 0…1 span the full 451 mm board (~1.1 mm/px).
    static let size = 400

    struct Sample {
        var y: [Float]
        var u: [Float]
        var v: [Float]
        var valid: [Bool]
    }

    struct Dart {
        /// Board coords (0.5,0.5 = bull, y down), same as `BoardHomography`.
        var boardX: Float
        var boardY: Float
        var pixels: Int
    }

    private var empty: Sample?
    /// Tripod pose at board lock — both shots are sampled with it (pixel-exact).
    private var pose: simd_float4x4?
    private(set) var lastMask: [Bool] = []
    private(set) var lastShadow: [Bool] = []
    private(set) var lastDarts: [Dart] = []
    private(set) var lastStats = ""

    var hasEmpty: Bool { empty != nil }

    func reset() {
        empty = nil
        pose = nil
        lastMask = []
        lastShadow = []
        lastDarts = []
    }

    func clearOverlay() {
        lastMask = []
        lastShadow = []
        lastDarts = []
    }

    func setEmpty(_ sample: Sample, pose: simd_float4x4) {
        empty = sample
        self.pose = pose
        clearOverlay()
    }

    var emptyPose: simd_float4x4? { pose }
    var emptySample: Sample? { empty }

    // MARK: - Averaging

    static func average(_ samples: [Sample]) -> Sample? {
        guard let first = samples.first else { return nil }
        if samples.count == 1 { return first }
        let count = first.y.count
        var out = Sample(
            y: [Float](repeating: 0, count: count),
            u: [Float](repeating: 0, count: count),
            v: [Float](repeating: 0, count: count),
            valid: [Bool](repeating: true, count: count)
        )
        for s in samples where s.y.count == count {
            for i in 0..<count {
                out.y[i] += s.y[i]
                out.u[i] += s.u[i]
                out.v[i] += s.v[i]
                out.valid[i] = out.valid[i] && s.valid[i]
            }
        }
        let k = 1 / Float(samples.count)
        for i in 0..<count {
            out.y[i] *= k
            out.u[i] *= k
            out.v[i] *= k
        }
        return out
    }

    // MARK: - Detection

    func detect(current cur: Sample, plane: BoardPlane) -> [Dart] {
        guard let emp = empty, let pose else {
            lastStats = "no_empty"
            return []
        }
        let n = Self.size
        let count = n * n
        let areaScale = Float(n * n) / Float(320 * 320)

        // Global exposure drift (should be ~1 with locked exposure).
        var sc: Float = 0, se: Float = 0
        for i in 0..<count where cur.valid[i] && emp.valid[i] {
            sc += cur.y[i]
            se += emp.y[i]
        }
        let gain = se > 1 ? min(1.4, max(0.7, sc / se)) : 1

        // Min diff over a 3×3 empty neighborhood — tolerates sub-pixel jitter on wires.
        let thresh: Float = 30
        var raw = [Bool](repeating: false, count: count)
        for py in 1..<(n - 1) {
            for px in 1..<(n - 1) {
                let i = py * n + px
                guard cur.valid[i] else { continue }
                var best = Float.greatestFiniteMagnitude
                for oy in -1...1 {
                    for ox in -1...1 {
                        let j = i + oy * n + ox
                        guard emp.valid[j] else { continue }
                        let d = abs(cur.y[i] - gain * emp.y[j])
                            + 1.5 * (abs(cur.u[i] - emp.u[j]) + abs(cur.v[i] - emp.v[j]))
                        if d < best { best = d }
                    }
                }
                if best > thresh { raw[i] = true }
            }
        }

        // Majority filter: kills speckle, keeps ≥3 px wide shafts.
        var mask = [Bool](repeating: false, count: count)
        var maskCount = 0
        for py in 1..<(n - 1) {
            for px in 1..<(n - 1) {
                let i = py * n + px
                var k = 0
                for oy in -1...1 {
                    for ox in -1...1 where raw[i + oy * n + ox] { k += 1 }
                }
                if k >= 5 {
                    mask[i] = true
                    maskCount += 1
                }
            }
        }

        // 8-connected components.
        var label = [Int32](repeating: -1, count: count)
        var comps: [[Int]] = []
        for i in 0..<count where mask[i] && label[i] < 0 {
            var comp: [Int] = []
            var stack = [i]
            label[i] = Int32(comps.count)
            while let k = stack.popLast() {
                comp.append(k)
                let kx = k % n, ky = k / n
                for oy in -1...1 {
                    for ox in -1...1 where ox != 0 || oy != 0 {
                        let x = kx + ox, y = ky + oy
                        guard x >= 0, y >= 0, x < n, y < n else { continue }
                        let j = y * n + x
                        if mask[j], label[j] < 0 {
                            label[j] = Int32(comps.count)
                            stack.append(j)
                        }
                    }
                }
            }
            comps.append(comp)
        }
        let minFrag = Int(10 * areaScale)
        let frags = comps.filter { $0.count >= minFrag }
        let minLinked = Int(25 * areaScale)

        // Merge fragments of one dart: lined up on the foot→dart ray, close along it.
        let foot = Self.cameraFootBoardPx(pose: pose, plane: plane)
        let cents: [SIMD2<Float>] = frags.map { comp in
            var s = SIMD2<Float>(0, 0)
            for k in comp { s += SIMD2(Float(k % n), Float(k / n)) }
            return s / Float(comp.count)
        }
        var parent = Array(0..<frags.count)
        func find(_ a: Int) -> Int {
            var a = a
            while parent[a] != a { parent[a] = parent[parent[a]]; a = parent[a] }
            return a
        }
        let perpMax: Float = 0.014 / Self.mmPerPxMeters
        let alongMax: Float = 0.070 / Self.mmPerPxMeters
        for a in 0..<frags.count {
            for b in (a + 1)..<max(a + 1, frags.count) {
                // Specks never link — they dragged tips onto noise.
                guard min(frags[a].count, frags[b].count) >= minLinked else { continue }
                let big = frags[a].count >= frags[b].count ? a : b
                let ray = cents[big] - foot
                guard simd_length(ray) > 1 else { continue }
                let d = simd_normalize(ray)
                let delta = cents[b] - cents[a]
                let along = abs(simd_dot(delta, d))
                let perp = abs(delta.x * d.y - delta.y * d.x)
                if perp < perpMax, along < alongMax {
                    parent[find(a)] = find(b)
                }
            }
        }
        var groups: [Int: [Int]] = [:]
        for (i, comp) in frags.enumerated() {
            groups[find(i), default: []].append(contentsOf: comp)
        }

        // Shadows keep the board texture (just darker); darts occlude it.
        var shadow = [Bool](repeating: false, count: count)
        for pix in groups.values {
            for i in pix where Self.isShadow(i, cur: cur, emp: emp, gain: gain, n: n) {
                shadow[i] = true
            }
        }

        let minDart = Int(55 * areaScale)
        let maxDart = count / 8
        var darts: [Dart] = []
        var bodies: [(pix: [Int], shadow: Int)] = []
        for pix in groups.values {
            let body = pix.filter { !shadow[$0] }
            let shadowPx = pix.count - body.count
            if body.count >= minDart / 2 {
                bodies.append((body, shadowPx))
            } else if Float(shadowPx) < 0.6 * Float(pix.count) {
                bodies.append((pix, shadowPx))
            }
        }
        for (pix, _) in bodies.sorted(by: { $0.pix.count > $1.pix.count }) {
            guard pix.count >= minDart, pix.count <= maxDart else { continue }
            guard let tip = Self.tipAlongAxis(pix, n: n, foot: foot) else { continue }
            let bx = (tip.x + 0.5) / Float(n)
            let by = (tip.y + 0.5) / Float(n)
            // Number ring / surround → still a dart (scored 0); beyond = wall noise.
            guard hypot(bx - 0.5, by - 0.5) <= 0.56 else { continue }
            darts.append(Dart(boardX: bx, boardY: by, pixels: pix.count))
            if darts.count == 3 { break }
        }

        lastMask = mask
        lastShadow = shadow
        lastDarts = darts
        let shadowPx = bodies.reduce(0) { $0 + $1.shadow }
        lastStats = "gain=\(String(format: "%.2f", gain)) mask=\(maskCount) shadow=\(shadowPx) frags=\(frags.count) groups=\(groups.count) darts=\(darts.count) sizes=\(darts.map(\.pixels)) foot=\(Int(foot.x)),\(Int(foot.y))"
        return darts
    }

    /// 5×5 patch: cur ≈ k·empty with k < 0.9 and small residual (Y and chroma) → shadow.
    private static func isShadow(_ i: Int, cur: Sample, emp: Sample, gain: Float, n: Int) -> Bool {
        let px = i % n, py = i / n
        guard px >= 2, py >= 2, px < n - 2, py < n - 2 else { return false }
        var ce: Float = 0, ee: Float = 0
        for oy in -2...2 {
            for ox in -2...2 {
                let j = i + oy * n + ox
                let e = gain * emp.y[j]
                ce += cur.y[j] * e
                ee += e * e
            }
        }
        guard ee > 1 else { return false }
        let k = ce / ee
        guard k > 0.25, k < 0.9 else { return false }
        var resY: Float = 0, resC: Float = 0
        for oy in -2...2 {
            for ox in -2...2 {
                let j = i + oy * n + ox
                resY += abs(cur.y[j] - k * gain * emp.y[j])
                resC += abs(cur.u[j] - k * emp.u[j]) + abs(cur.v[j] - k * emp.v[j])
            }
        }
        return resY / 25 < 7 && resC / 25 < 9
    }

    private static var mmPerPxMeters: Float { 0.451 / Float(size) }

    /// PCA axis of the dart blob; tip = end facing the camera foot point.
    private static func tipAlongAxis(_ pix: [Int], n: Int, foot: SIMD2<Float>) -> SIMD2<Float>? {
        guard !pix.isEmpty else { return nil }
        var c = SIMD2<Float>(0, 0)
        for k in pix { c += SIMD2(Float(k % n), Float(k / n)) }
        c /= Float(pix.count)
        var sxx: Float = 0, syy: Float = 0, sxy: Float = 0
        for k in pix {
            let d = SIMD2(Float(k % n), Float(k / n)) - c
            sxx += d.x * d.x
            syy += d.y * d.y
            sxy += d.x * d.y
        }
        let tr = sxx + syy
        let det = sxx * syy - sxy * sxy
        let disc = max(0, tr * tr / 4 - det)
        let l1 = tr / 2 + disc.squareRoot()
        let l2 = tr / 2 - disc.squareRoot()
        var axis: SIMD2<Float>
        if l1 > 2.5 * max(l2, 1e-3), abs(sxy) > 1e-4 || abs(sxx - syy) > 1e-4 {
            axis = abs(sxy) > 1e-4
                ? simd_normalize(SIMD2(l1 - syy, sxy))
                : (sxx >= syy ? SIMD2(1, 0) : SIMD2(0, 1))
        } else {
            let ray = c - foot
            axis = simd_length(ray) > 1 ? simd_normalize(ray) : SIMD2(0, 1)
        }
        // Point the axis from tip → flight (away from the foot point).
        if simd_dot(axis, c - foot) < 0 { axis = -axis }

        var minP = Float.greatestFiniteMagnitude
        for k in pix {
            let p = simd_dot(SIMD2(Float(k % n), Float(k / n)) - c, axis)
            minP = min(minP, p)
        }
        var t = SIMD2<Float>(0, 0)
        var cnt: Float = 0
        for k in pix {
            let d = SIMD2(Float(k % n), Float(k / n)) - c
            let p = simd_dot(d, axis)
            let perp = abs(d.x * axis.y - d.y * axis.x)
            if p <= minP + 4, perp <= 5 {
                t += SIMD2(Float(k % n), Float(k / n))
                cnt += 1
            }
        }
        if cnt < 1 { return c + axis * minP }
        return t / cnt
    }

    // MARK: - Geometry

    /// Camera center dropped onto the board plane, in unwrap pixels.
    static func cameraFootBoardPx(pose: simd_float4x4, plane: BoardPlane) -> SIMD2<Float> {
        let t = pose.columns.3
        let cam = SIMD3<Float>(t.x, t.y, t.z)
        let right = simd_normalize(simd_cross(plane.up, plane.normal))
        let d = cam - plane.center
        let span = boardSpan(plane)
        let bx = 0.5 + simd_dot(d, right) / span
        let by = 0.5 - simd_dot(d, plane.up) / span
        return SIMD2(bx * Float(size), by * Float(size))
    }

    /// Meters covered by board coords 0…1.
    static func boardSpan(_ plane: BoardPlane) -> Float {
        plane.radius / BoardHomography.outerDoubleR
    }

    /// Frontal unwrap of the board plane: YUV per pixel (Y bilinear, UV nearest).
    /// `pose` overrides the frame's camera transform (tripod); intrinsics always
    /// come from the frame so high-res captures map correctly.
    static func sample(
        frame: ARFrame,
        plane: BoardPlane,
        pose: simd_float4x4? = nil,
        size: Int = PlaneDartDetector.size
    ) -> Sample? {
        let src = frame.capturedImage
        let srcW = CVPixelBufferGetWidth(src)
        let srcH = CVPixelBufferGetHeight(src)
        guard srcW > 32, srcH > 32 else { return nil }

        let cam = frame.camera
        let view = (pose ?? cam.transform).inverse
        // Intrinsics are for camera.imageResolution; rescale if the buffer differs.
        let ks = Float(srcW) / Float(cam.imageResolution.width)
        let fx = cam.intrinsics[0, 0] * ks, fy = cam.intrinsics[1, 1] * ks
        let cx = cam.intrinsics[2, 0] * ks, cy = cam.intrinsics[2, 1] * ks
        let right = simd_normalize(simd_cross(plane.up, plane.normal))
        let span = boardSpan(plane)
        // Camera-space point is affine in (bx, by).
        let origin = plane.center - right * (0.5 * span) + plane.up * (0.5 * span)
        let p0 = view * SIMD4<Float>(origin, 1)
        let pa = view * SIMD4<Float>(right * span, 0)
        let pb = view * SIMD4<Float>(-plane.up * span, 0)

        CVPixelBufferLockBaseAddress(src, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(src, .readOnly) }
        guard CVPixelBufferGetPlaneCount(src) >= 2,
              let yBase = CVPixelBufferGetBaseAddressOfPlane(src, 0),
              let uvBase = CVPixelBufferGetBaseAddressOfPlane(src, 1)
        else { return nil }
        let yStride = CVPixelBufferGetBytesPerRowOfPlane(src, 0)
        let uvStride = CVPixelBufferGetBytesPerRowOfPlane(src, 1)
        let yP = yBase.assumingMemoryBound(to: UInt8.self)
        let uvP = uvBase.assumingMemoryBound(to: UInt8.self)

        let count = size * size
        var out = Sample(
            y: [Float](repeating: 0, count: count),
            u: [Float](repeating: 0, count: count),
            v: [Float](repeating: 0, count: count),
            valid: [Bool](repeating: false, count: count)
        )
        let s = Float(size)
        for py in 0..<size {
            let b = (Float(py) + 0.5) / s
            for px in 0..<size {
                let a = (Float(px) + 0.5) / s
                let p = p0 + pa * a + pb * b
                guard p.z < -0.05 else { continue }
                let ix = fx * (p.x / -p.z) + cx - 0.5
                let iy = fy * (-p.y / -p.z) + cy - 0.5
                guard ix >= 0, iy >= 0, ix < Float(srcW - 2), iy < Float(srcH - 2) else { continue }
                let x0 = Int(ix), y0 = Int(iy)
                let fxr = ix - Float(x0), fyr = iy - Float(y0)
                let r0 = y0 * yStride + x0
                let r1 = r0 + yStride
                let top = Float(yP[r0]) * (1 - fxr) + Float(yP[r0 + 1]) * fxr
                let bot = Float(yP[r1]) * (1 - fxr) + Float(yP[r1 + 1]) * fxr
                let i = py * size + px
                out.y[i] = top * (1 - fyr) + bot * fyr
                let uvI = (y0 / 2) * uvStride + (x0 / 2) * 2
                out.u[i] = Float(uvP[uvI]) - 128
                out.v[i] = Float(uvP[uvI + 1]) - 128
                out.valid[i] = true
            }
        }
        return out
    }
}
