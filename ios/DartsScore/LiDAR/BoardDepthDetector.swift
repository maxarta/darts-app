import Foundation
import ARKit
import simd

/// Finds the dartboard purely from LiDAR depth: a ~38 mm thick disk standing
/// proud of the wall. No RGB, no ML — immune to red signs / wood grain.
enum BoardDepthDetector {
    struct Result {
        /// Center on the board face (world meters).
        var center: SIMD3<Float>
        /// Wall normal, pointing toward the camera.
        var normal: SIMD3<Float>
        var diameter: Float
        var faceOffset: Float
        var cells: Int
    }

    private(set) static var lastReject = ""

    /// Full board (incl. number ring) ≈ 451 mm.
    private static let boardDiameter: Float = 0.451
    private static let cell: Float = 0.015
    private static let bandMin: Float = 0.015
    private static let bandMax: Float = 0.080

    static func detect(frame: ARFrame) -> Result? {
        guard let depthData = frame.smoothedSceneDepth ?? frame.sceneDepth else {
            lastReject = "no_depth"
            return nil
        }
        let pts = worldPoints(depthData: depthData, camera: frame.camera)
        guard pts.count > 1500 else {
            lastReject = "few_pts=\(pts.count)"
            return nil
        }
        let t = frame.camera.transform.columns.3
        let cam = SIMD3<Float>(t.x, t.y, t.z)

        guard let wall = fitWall(pts, camera: cam) else {
            lastReject = "no_wall"
            return nil
        }
        var n = wall.normal
        if simd_dot(n, cam - wall.origin) < 0 { n = -n }

        let gravityUp = SIMD3<Float>(0, 1, 0)
        var up = gravityUp - simd_dot(gravityUp, n) * n
        guard simd_length(up) > 1e-3 else {
            lastReject = "wall_horizontal"
            return nil
        }
        up = simd_normalize(up)
        let right = simd_normalize(simd_cross(up, n))

        // Points standing 1.5–8 cm in front of the wall → board candidates.
        struct Cell { var n = 0; var s: Float = 0 }
        var grid: [SIMD2<Int32>: Cell] = [:]
        for p in pts {
            let d = p - wall.origin
            let s = simd_dot(d, n)
            guard s >= bandMin, s <= bandMax else { continue }
            let u = simd_dot(d, right)
            let v = simd_dot(d, up)
            let key = SIMD2<Int32>(Int32((u / cell).rounded(.down)), Int32((v / cell).rounded(.down)))
            var c = grid[key, default: Cell()]
            c.n += 1
            c.s += s
            grid[key] = c
        }
        guard grid.count > 40 else {
            lastReject = "no_relief cells=\(grid.count)"
            return nil
        }

        let expected = Float.pi * pow(boardDiameter * 0.5, 2) / (cell * cell)
        var visited = Set<SIMD2<Int32>>()
        var best: (cells: [SIMD2<Int32>], score: Float)?
        for key in grid.keys where !visited.contains(key) {
            var comp: [SIMD2<Int32>] = []
            var queue = [key]
            visited.insert(key)
            while let k = queue.popLast() {
                comp.append(k)
                for dx in -1...1 {
                    for dy in -1...1 where dx != 0 || dy != 0 {
                        let nk = SIMD2<Int32>(k.x + Int32(dx), k.y + Int32(dy))
                        if grid[nk] != nil, !visited.contains(nk) {
                            visited.insert(nk)
                            queue.append(nk)
                        }
                    }
                }
            }
            let ratio = Float(comp.count) / expected
            guard ratio > 0.35, ratio < 1.7 else { continue }
            let xs = comp.map(\.x), ys = comp.map(\.y)
            let w = Float(xs.max()! - xs.min()! + 1) * cell
            let h = Float(ys.max()! - ys.min()! + 1) * cell
            guard w > 0.25, h > 0.25, w < 0.62, h < 0.62 else { continue }
            let aspect = w / h
            guard aspect > 0.65, aspect < 1.55 else { continue }
            let score = abs(log(ratio)) + abs(log(aspect))
            if best == nil || score < best!.score {
                best = (comp, score)
            }
        }
        guard let comp = best?.cells else {
            lastReject = "no_disk cells=\(grid.count)"
            return nil
        }

        // Center: circle fit on the component boundary, centroid as fallback.
        let compSet = Set(comp)
        var cu: Float = 0, cv: Float = 0, sSum: Float = 0, sN = 0
        var boundary: [SIMD2<Float>] = []
        for k in comp {
            let p = SIMD2<Float>((Float(k.x) + 0.5) * cell, (Float(k.y) + 0.5) * cell)
            cu += p.x
            cv += p.y
            if let c = grid[k] {
                sSum += c.s
                sN += c.n
            }
            let edge = [SIMD2<Int32>(1, 0), SIMD2(-1, 0), SIMD2(0, 1), SIMD2(0, -1)]
                .contains { !compSet.contains(k &+ $0) }
            if edge { boundary.append(p) }
        }
        var center2 = SIMD2<Float>(cu, cv) / Float(comp.count)
        var radius = boardDiameter * 0.5
        if let fit = fitCircle(boundary), fit.r > 0.17, fit.r < 0.29 {
            center2 = fit.c
            radius = fit.r
        }
        let faceOffset = sN > 0 ? sSum / Float(sN) : 0.038

        let center = wall.origin + right * center2.x + up * center2.y + n * faceOffset
        lastReject = ""
        return Result(
            center: center,
            normal: n,
            diameter: radius * 2,
            faceOffset: faceOffset,
            cells: comp.count
        )
    }

    // MARK: - Depth → world

    private static func worldPoints(depthData: ARDepthData, camera: ARCamera) -> [SIMD3<Float>] {
        let depthMap = depthData.depthMap
        let dw = CVPixelBufferGetWidth(depthMap)
        let dh = CVPixelBufferGetHeight(depthMap)
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
        guard let dBase = CVPixelBufferGetBaseAddress(depthMap) else { return [] }
        let dStride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.size
        let dPtr = dBase.assumingMemoryBound(to: Float32.self)

        var cPtr: UnsafeMutablePointer<UInt8>?
        var cStride = 0
        let confMap = depthData.confidenceMap
        if let confMap {
            CVPixelBufferLockBaseAddress(confMap, .readOnly)
            cPtr = CVPixelBufferGetBaseAddress(confMap)?.assumingMemoryBound(to: UInt8.self)
            cStride = CVPixelBufferGetBytesPerRow(confMap)
        }
        defer {
            if let confMap { CVPixelBufferUnlockBaseAddress(confMap, .readOnly) }
        }

        var pts: [SIMD3<Float>] = []
        pts.reserveCapacity(dw * dh)
        for y in 0..<dh {
            for x in 0..<dw {
                if let cPtr, cPtr[y * cStride + x] < UInt8(ARConfidenceLevel.medium.rawValue) {
                    continue
                }
                let d = dPtr[y * dStride + x]
                guard d.isFinite, d > 0.4, d < 4.5 else { continue }
                if let w = BoardPlaneEstimator.worldPoint(
                    depthX: x, depthY: y, depth: d,
                    depthWidth: dw, depthHeight: dh,
                    camera: camera, orientation: .portrait
                ) {
                    pts.append(w)
                }
            }
        }
        return pts
    }

    // MARK: - Wall (RANSAC, vertical, largest)

    private static func fitWall(
        _ pts: [SIMD3<Float>],
        camera: SIMD3<Float>
    ) -> (origin: SIMD3<Float>, normal: SIMD3<Float>)? {
        var rng = SystemRandomNumberGenerator()
        let evalCount = min(pts.count, 3000)
        let eval = (0..<evalCount).map { _ in pts[Int.random(in: 0..<pts.count, using: &rng)] }

        var best: (o: SIMD3<Float>, n: SIMD3<Float>, count: Int)?
        for _ in 0..<180 {
            let a = pts[Int.random(in: 0..<pts.count, using: &rng)]
            let b = pts[Int.random(in: 0..<pts.count, using: &rng)]
            let c = pts[Int.random(in: 0..<pts.count, using: &rng)]
            let cr = simd_cross(b - a, c - a)
            guard simd_length(cr) > 1e-5 else { continue }
            let n = simd_normalize(cr)
            guard abs(n.y) < 0.35 else { continue }
            var count = 0
            for p in eval where abs(simd_dot(p - a, n)) < 0.012 { count += 1 }
            if best == nil || count > best!.count {
                best = (a, n, count)
            }
        }
        guard let b = best, b.count > evalCount / 8 else { return nil }

        // Least-squares refine on all inliers.
        var mean = SIMD3<Float>(0, 0, 0)
        var inliers: [SIMD3<Float>] = []
        for p in pts where abs(simd_dot(p - b.o, b.n)) < 0.015 {
            inliers.append(p)
            mean += p
        }
        guard inliers.count > 300 else { return (b.o, b.n) }
        mean /= Float(inliers.count)
        var cov = [[Float]](repeating: [0, 0, 0], count: 3)
        for p in inliers {
            let d = p - mean
            let v = [d.x, d.y, d.z]
            for i in 0..<3 { for j in 0..<3 { cov[i][j] += v[i] * v[j] } }
        }
        var n = smallestEigenvector(cov) ?? b.n
        if simd_dot(n, b.n) < 0 { n = -n }
        if simd_dot(n, camera - mean) < 0 { n = -n }
        return (mean, n)
    }

    /// Jacobi eigen-decomposition of a symmetric 3×3 → eigenvector of the smallest eigenvalue.
    private static func smallestEigenvector(_ m: [[Float]]) -> SIMD3<Float>? {
        var a = m
        var v: [[Float]] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        for _ in 0..<12 {
            for (p, q) in [(0, 1), (0, 2), (1, 2)] {
                guard abs(a[p][q]) > 1e-12 else { continue }
                let theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
                let t = (theta >= 0 ? 1 : -1) / (abs(theta) + sqrt(theta * theta + 1))
                let c = 1 / sqrt(t * t + 1)
                let s = t * c
                for k in 0..<3 {
                    let akp = a[k][p], akq = a[k][q]
                    a[k][p] = c * akp - s * akq
                    a[k][q] = s * akp + c * akq
                }
                for k in 0..<3 {
                    let apk = a[p][k], aqk = a[q][k]
                    a[p][k] = c * apk - s * aqk
                    a[q][k] = s * apk + c * aqk
                }
                for k in 0..<3 {
                    let vkp = v[k][p], vkq = v[k][q]
                    v[k][p] = c * vkp - s * vkq
                    v[k][q] = s * vkp + c * vkq
                }
            }
        }
        let evals = [a[0][0], a[1][1], a[2][2]]
        guard let i = evals.indices.min(by: { evals[$0] < evals[$1] }) else { return nil }
        let e = SIMD3<Float>(v[0][i], v[1][i], v[2][i])
        guard simd_length(e) > 1e-6 else { return nil }
        return simd_normalize(e)
    }

    /// Kåsa algebraic circle fit.
    private static func fitCircle(_ pts: [SIMD2<Float>]) -> (c: SIMD2<Float>, r: Float)? {
        guard pts.count >= 12 else { return nil }
        var sx: Double = 0, sy: Double = 0, sxx: Double = 0, syy: Double = 0, sxy: Double = 0
        var sxz: Double = 0, syz: Double = 0, sz: Double = 0
        for p in pts {
            let x = Double(p.x), y = Double(p.y), z = x * x + y * y
            sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
            sxz += x * z; syz += y * z; sz += z
        }
        let n = Double(pts.count)
        // Solve [sxx sxy sx; sxy syy sy; sx sy n] [A B C] = [sxz syz sz]
        let m: [[Double]] = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]]
        let rhs = [sxz, syz, sz]
        func det3(_ a: [[Double]]) -> Double {
            a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
                - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
                + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
        }
        let d = det3(m)
        guard abs(d) > 1e-18 else { return nil }
        var sol = [Double](repeating: 0, count: 3)
        for col in 0..<3 {
            var mc = m
            for row in 0..<3 { mc[row][col] = rhs[row] }
            sol[col] = det3(mc) / d
        }
        let cx = sol[0] / 2, cy = sol[1] / 2
        let r2 = sol[2] + cx * cx + cy * cy
        guard r2 > 0 else { return nil }
        return (SIMD2(Float(cx), Float(cy)), Float(r2.squareRoot()))
    }
}
