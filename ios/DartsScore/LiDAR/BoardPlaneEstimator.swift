import Foundation
import simd
import ARKit
import UIKit

enum BoardPlaneEstimator {
    /// Standard outer double radius (meters).
    static let standardRadius: Float = 0.170

    /// Segment order clockwise from top (20), same as web `BOARD_SEGMENTS`.
    static let segments: [Int] = [
        20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
    ]

    static let rDB: Float = 6.35 / 170
    static let rSB: Float = 15.9 / 170
    static let rTripleIn: Float = 99 / 170
    static let rTripleOut: Float = 107 / 170
    static let rDoubleIn: Float = 162 / 170

    /// Build a board plane from a vertical AR plane anchor + tap on bull.
    static func makePlane(
        center: SIMD3<Float>,
        planeNormal: SIMD3<Float>,
        gravityUp: SIMD3<Float> = SIMD3<Float>(0, 1, 0),
        cameraPosition: SIMD3<Float>? = nil
    ) -> BoardPlane {
        var n = simd_normalize(planeNormal)
        // Normal must point toward the camera (out of the wall toward the thrower).
        if let cam = cameraPosition {
            if simd_dot(n, simd_normalize(cam - center)) < 0 { n = -n }
        } else if n.z > 0 {
            n = -n
        }

        // Project world up onto the board plane → "20" direction (top of board).
        var up = gravityUp - simd_dot(gravityUp, n) * n
        if simd_length(up) < 1e-4 {
            let fallback = SIMD3<Float>(0, 0, -1)
            up = fallback - simd_dot(fallback, n) * n
        }
        up = simd_normalize(up)

        return BoardPlane(
            center: center,
            normal: n,
            radius: standardRadius,
            up: up
        )
    }

    /// Intersect a camera ray with the board plane; return score or nil if miss far away.
    static func score(
        rayOrigin: SIMD3<Float>,
        rayDirection: SIMD3<Float>,
        plane: BoardPlane
    ) -> NativeThrowInput? {
        let denom = simd_dot(rayDirection, plane.normal)
        if abs(denom) < 1e-5 { return nil }
        let t = simd_dot(plane.center - rayOrigin, plane.normal) / denom
        if t < 0.05 || t > 8 { return nil }

        let hit = rayOrigin + t * rayDirection
        let delta = hit - plane.center
        let dist = simd_length(delta)
        let norm = dist / plane.radius

        if norm > 1.12 {
            return NativeThrowInput(segment: .miss, multiplier: 1, confidence: 0.55)
        }

        let right = simd_normalize(simd_cross(plane.up, plane.normal))
        let x = simd_dot(delta, right)
        let y = simd_dot(delta, plane.up)
        // 0 = top (20), clockwise
        var angle = atan2(x, y)
        if angle < 0 { angle += .pi * 2 }
        let wedge = Float.pi * 2 / 20
        let idx = Int(floor((angle + wedge / 2) / wedge)) % 20
        let segment = segments[(idx + 20) % 20]

        if norm <= rDB {
            return NativeThrowInput(segment: .bull50, multiplier: 1, confidence: 0.9)
        }
        if norm <= rSB {
            return NativeThrowInput(segment: .bull25, multiplier: 1, confidence: 0.85)
        }
        if norm >= rTripleIn && norm < rTripleOut {
            return NativeThrowInput(segment: .number(segment), multiplier: 3, confidence: 0.75)
        }
        if norm >= rDoubleIn && norm <= 1.05 {
            return NativeThrowInput(segment: .number(segment), multiplier: 2, confidence: 0.75)
        }
        return NativeThrowInput(segment: .number(segment), multiplier: 1, confidence: 0.7)
    }

    /// Camera ray through a capturedImage pixel (sensor / intrinsics frame).
    static func rayFromImagePixel(
        imageX: Float,
        imageY: Float,
        camera: ARCamera
    ) -> (origin: SIMD3<Float>, direction: SIMD3<Float>) {
        let fx = camera.intrinsics[0, 0]
        let fy = camera.intrinsics[1, 1]
        let cx = camera.intrinsics[2, 0]
        let cy = camera.intrinsics[2, 1]
        let x = (imageX - cx) / fx
        let y = -((imageY - cy) / fy)
        let dirCam = simd_normalize(SIMD3<Float>(x, y, -1))
        let t = camera.transform
        let origin = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
        let dirWorld = simd_normalize(
            SIMD3<Float>(
                t.columns.0.x * dirCam.x + t.columns.1.x * dirCam.y + t.columns.2.x * dirCam.z,
                t.columns.0.y * dirCam.x + t.columns.1.y * dirCam.y + t.columns.2.y * dirCam.z,
                t.columns.0.z * dirCam.x + t.columns.1.z * dirCam.y + t.columns.2.z * dirCam.z
            )
        )
        return (origin, dirWorld)
    }

    /// Sample scene depth (meters) at a capturedImage pixel, or nil.
    static func depthAtImagePixel(
        imageX: Float,
        imageY: Float,
        frame: ARFrame
    ) -> Float? {
        guard let depthData = frame.sceneDepth ?? frame.smoothedSceneDepth else {
            return nil
        }
        let depthMap = depthData.depthMap
        let w = CVPixelBufferGetWidth(depthMap)
        let h = CVPixelBufferGetHeight(depthMap)
        let res = frame.camera.imageResolution
        let dx = Int((imageX / Float(res.width) * Float(w)).rounded())
        let dy = Int((imageY / Float(res.height) * Float(h)).rounded())
        guard dx >= 0, dy >= 0, dx < w, dy < h else { return nil }

        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(depthMap) else { return nil }
        let stride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.size
        let ptr = base.assumingMemoryBound(to: Float32.self)
        let d = ptr[dy * stride + dx]
        guard d.isFinite, d > 0.2, d < 5 else { return nil }
        return d
    }

    /// Unproject a capturedImage pixel via LiDAR depth → world meters.
    static func worldFromImagePixel(
        imageX: Float,
        imageY: Float,
        frame: ARFrame,
        orientation: UIInterfaceOrientation = .portrait
    ) -> SIMD3<Float>? {
        guard let depthData = frame.sceneDepth ?? frame.smoothedSceneDepth else {
            return nil
        }
        let depthMap = depthData.depthMap
        let dw = CVPixelBufferGetWidth(depthMap)
        let dh = CVPixelBufferGetHeight(depthMap)
        let res = frame.camera.imageResolution
        let dx = Int((imageX / Float(res.width) * Float(dw)).rounded())
        let dy = Int((imageY / Float(res.height) * Float(dh)).rounded())
        guard dx >= 0, dy >= 0, dx < dw, dy < dh else { return nil }

        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(depthMap) else { return nil }
        let stride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.size
        let ptr = base.assumingMemoryBound(to: Float32.self)
        // 3×3 median-ish: average valid neighbors for stability.
        var sum: Float = 0
        var n: Float = 0
        for oy in -1...1 {
            for ox in -1...1 {
                let x = dx + ox, y = dy + oy
                guard x >= 0, y >= 0, x < dw, y < dh else { continue }
                let d = ptr[y * stride + x]
                guard d.isFinite, d > 0.2, d < 5 else { continue }
                sum += d
                n += 1
            }
        }
        guard n >= 3 else { return nil }
        return worldPoint(
            depthX: dx,
            depthY: dy,
            depth: sum / n,
            depthWidth: dw,
            depthHeight: dh,
            camera: frame.camera,
            orientation: orientation
        )
    }

    /// Fit wall from LiDAR depth around board — cross of image-right/down unprojections.
    static func wallFromDepthAroundBoard(
        bullX: Float,
        bullY: Float,
        radiusPx: Float,
        frame: ARFrame,
        orientation: UIInterfaceOrientation = .portrait
    ) -> (origin: SIMD3<Float>, normal: SIMD3<Float>)? {
        let cam = SIMD3<Float>(
            frame.camera.transform.columns.3.x,
            frame.camera.transform.columns.3.y,
            frame.camera.transform.columns.3.z
        )
        let r = max(radiusPx, 40)
        guard let c = worldFromImagePixel(
            imageX: bullX, imageY: bullY, frame: frame, orientation: orientation
        ) else { return nil }

        // Average several radii for a stable tangent basis.
        var rights: [SIMD3<Float>] = []
        var downs: [SIMD3<Float>] = []
        for scale: Float in [0.55, 0.75, 0.95] {
            let rr = r * scale
            if let p = worldFromImagePixel(
                imageX: bullX + rr, imageY: bullY, frame: frame, orientation: orientation
            ) {
                rights.append(p - c)
            }
            if let p = worldFromImagePixel(
                imageX: bullX - rr, imageY: bullY, frame: frame, orientation: orientation
            ) {
                rights.append(c - p)
            }
            if let p = worldFromImagePixel(
                imageX: bullX, imageY: bullY + rr, frame: frame, orientation: orientation
            ) {
                downs.append(p - c)
            }
            if let p = worldFromImagePixel(
                imageX: bullX, imageY: bullY - rr, frame: frame, orientation: orientation
            ) {
                downs.append(c - p)
            }
        }
        guard !rights.isEmpty, !downs.isEmpty else { return nil }
        var right = rights.reduce(SIMD3<Float>(0, 0, 0), +) / Float(rights.count)
        var down = downs.reduce(SIMD3<Float>(0, 0, 0), +) / Float(downs.count)
        guard simd_length(right) > 0.01, simd_length(down) > 0.01 else { return nil }
        right = simd_normalize(right)
        down = simd_normalize(down)
        var n = simd_normalize(simd_cross(right, down))
        // Wall: mostly horizontal normal.
        if abs(simd_dot(n, SIMD3<Float>(0, 1, 0))) > 0.55 {
            // Degenerate (camera too frontal with bad depth) — flatten.
            n.y = 0
            guard simd_length(n) > 0.2 else { return nil }
            n = simd_normalize(n)
        }
        if simd_dot(n, simd_normalize(cam - c)) < 0 { n = -n }

        // Sanity: more ring samples should lie near the plane.
        var ok = 0
        var total = 0
        for i in 0..<24 {
            let ang = Float(i) / 24.0 * Float.pi * 2
            let ix = bullX + cos(ang) * r * 0.85
            let iy = bullY + sin(ang) * r * 0.85
            guard let w = worldFromImagePixel(
                imageX: ix, imageY: iy, frame: frame, orientation: orientation
            ) else { continue }
            total += 1
            if abs(simd_dot(w - c, n)) < 0.04 { ok += 1 }
        }
        guard total >= 8, Float(ok) / Float(total) >= 0.5 else { return nil }
        return (c, n)
    }

    /// Best vertical ARPlaneAnchor facing the camera (secondary — slow to appear).
    static func bestVerticalWall(
        frame: ARFrame
    ) -> (origin: SIMD3<Float>, normal: SIMD3<Float>)? {
        let cam = SIMD3<Float>(
            frame.camera.transform.columns.3.x,
            frame.camera.transform.columns.3.y,
            frame.camera.transform.columns.3.z
        )
        var best: (origin: SIMD3<Float>, normal: SIMD3<Float>, score: Float)?
        for anchor in frame.anchors {
            guard let plane = anchor as? ARPlaneAnchor, plane.alignment == .vertical else {
                continue
            }
            let t = plane.transform
            var n = simd_normalize(SIMD3<Float>(t.columns.1.x, t.columns.1.y, t.columns.1.z))
            let local = plane.center
            let origin4 = t * SIMD4<Float>(local.x, local.y, local.z, 1)
            let origin = SIMD3<Float>(origin4.x, origin4.y, origin4.z)
            if abs(simd_dot(n, SIMD3<Float>(0, 1, 0))) > 0.45 { continue }
            if simd_dot(n, simd_normalize(cam - origin)) < 0 { n = -n }
            let dist = simd_length(cam - origin)
            guard dist > 0.3, dist < 6 else { continue }
            let area = max(plane.extent.x, 0.05) * max(plane.extent.z, 0.05)
            let score = area / max(dist, 0.5)
            if best == nil || score > best!.score {
                best = (origin, n, score)
            }
        }
        guard let b = best else { return nil }
        return (b.origin, b.normal)
    }

    /// Camera-facing plane through a depth bull when wall anchors are missing.
    static func facingPlaneThroughPoint(
        _ world: SIMD3<Float>,
        camera: ARCamera
    ) -> (origin: SIMD3<Float>, normal: SIMD3<Float>) {
        let cam = SIMD3<Float>(
            camera.transform.columns.3.x,
            camera.transform.columns.3.y,
            camera.transform.columns.3.z
        )
        var n = simd_normalize(cam - world)
        // Flatten to mostly horizontal normal (wall).
        n.y = 0
        if simd_length(n) < 0.2 {
            n = SIMD3<Float>(-camera.transform.columns.2.x, 0, -camera.transform.columns.2.z)
        }
        n = simd_normalize(n)
        return (world, n)
    }

    /// Snap a world point onto a plane along the normal.
    static func projectOntoPlane(
        _ world: SIMD3<Float>,
        origin: SIMD3<Float>,
        normal: SIMD3<Float>
    ) -> SIMD3<Float> {
        let n = simd_normalize(normal)
        let along = simd_dot(world - origin, n)
        return world - along * n
    }

    /// Score a world-space tip — project onto the locked board plane (angle-independent).
    static func scoreWorldPoint(_ world: SIMD3<Float>, plane: BoardPlane) -> NativeThrowInput? {
        let along = simd_dot(world - plane.center, plane.normal)
        let onPlane = world - along * plane.normal
        let delta = onPlane - plane.center
        let dist = simd_length(delta)
        let norm = dist / plane.radius

        // Beyond the outer double wire = number ring / wall → 0.
        if norm > 1.0 {
            return NativeThrowInput(segment: .miss, multiplier: 1, confidence: 0.6)
        }

        let right = simd_normalize(simd_cross(plane.up, plane.normal))
        let x = simd_dot(delta, right)
        let y = simd_dot(delta, plane.up)
        var angle = atan2(x, y)
        if angle < 0 { angle += .pi * 2 }
        let wedge = Float.pi * 2 / 20
        let idx = Int(floor((angle + wedge / 2) / wedge)) % 20
        let segment = segments[(idx + 20) % 20]

        if norm <= rDB {
            return NativeThrowInput(segment: .bull50, multiplier: 1, confidence: 0.9)
        }
        if norm <= rSB {
            return NativeThrowInput(segment: .bull25, multiplier: 1, confidence: 0.85)
        }
        if norm >= rTripleIn && norm < rTripleOut {
            return NativeThrowInput(segment: .number(segment), multiplier: 3, confidence: 0.75)
        }
        if norm >= rDoubleIn && norm <= 1.05 {
            return NativeThrowInput(segment: .number(segment), multiplier: 2, confidence: 0.75)
        }
        return NativeThrowInput(segment: .number(segment), multiplier: 1, confidence: 0.7)
    }

    /// Unproject a depth-map pixel to world space.
    /// Matches Apple's "Visualizing a Point Cloud Using Scene Depth" convention:
    /// image Y down → flip Y; optical depth → camera −Z; then camera.transform.
    static func worldPoint(
        depthX: Int,
        depthY: Int,
        depth: Float,
        depthWidth: Int,
        depthHeight: Int,
        camera: ARCamera,
        orientation: UIInterfaceOrientation
    ) -> SIMD3<Float>? {
        guard depth > 0.05, depth < 6 else { return nil }

        var intrinsics = camera.intrinsics
        let imageRes = camera.imageResolution
        // Depth map is lower-res than capturedImage — scale K down to depth pixels.
        let sx = Float(depthWidth) / Float(imageRes.width)
        let sy = Float(depthHeight) / Float(imageRes.height)
        intrinsics[0, 0] *= sx // fx
        intrinsics[1, 1] *= sy // fy
        intrinsics[2, 0] *= sx // cx
        intrinsics[2, 1] *= sy // cy

        let fx = intrinsics[0, 0]
        let fy = intrinsics[1, 1]
        let cx = intrinsics[2, 0]
        let cy = intrinsics[2, 1]

        let u = Float(depthX) + 0.5
        let v = Float(depthY) + 0.5
        let xrw = (u - cx) * depth / fx
        let yrw = (v - cy) * depth / fy

        // Sensor / capturedImage space → ARKit camera space (flip Y and Z).
        // IMPORTANT: depth + intrinsics are ALWAYS in the sensor frame (usually
        // landscape). Do NOT use viewMatrix(for: orientation) here — that rotates
        // portrait UI and produced a consistent +90° segment error (20→6, 18→15).
        let camLocal = SIMD4<Float>(xrw, -yrw, -depth, 1)
        _ = orientation // kept for call-site compatibility
        let world = camera.transform * camLocal
        return SIMD3<Float>(world.x, world.y, world.z)
    }
}
