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

    /// Score a world-space tip — project onto the locked board plane (angle-independent).
    static func scoreWorldPoint(_ world: SIMD3<Float>, plane: BoardPlane) -> NativeThrowInput? {
        let along = simd_dot(world - plane.center, plane.normal)
        let onPlane = world - along * plane.normal
        let delta = onPlane - plane.center
        let dist = simd_length(delta)
        let norm = dist / plane.radius

        if norm > 1.12 {
            return NativeThrowInput(segment: .miss, multiplier: 1, confidence: 0.55)
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
