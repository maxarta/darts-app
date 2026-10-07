import Foundation
import simd
import ARKit

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
        gravityUp: SIMD3<Float> = SIMD3<Float>(0, 1, 0)
    ) -> BoardPlane {
        var n = simd_normalize(planeNormal)
        // Prefer normal facing the camera (+Z world roughly toward user in portrait AR).
        if n.z > 0 { n = -n }

        // Project world up onto the board plane → "20" direction.
        var up = gravityUp - simd_dot(gravityUp, n) * n
        if simd_length(up) < 1e-4 {
            up = SIMD3<Float>(0, 0, -1) - simd_dot(SIMD3<Float>(0, 0, -1), n) * n
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

    /// Unproject a depth-map pixel to a world-space point.
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
        let intrinsics = camera.intrinsics
        // Depth map is typically lower res than camera image; scale UVs.
        let fx = intrinsics[0, 0]
        let fy = intrinsics[1, 1]
        let cx = intrinsics[2, 0]
        let cy = intrinsics[2, 1]

        // Map depth pixel → camera image pixel (approx full-res).
        // ARKit depth is aligned to capturedImage.
        let imageRes = camera.imageResolution
        let u = (Float(depthX) + 0.5) / Float(depthWidth) * Float(imageRes.width)
        let v = (Float(depthY) + 0.5) / Float(depthHeight) * Float(imageRes.height)

        let xCam = (u - cx) * depth / fx
        let yCam = (v - cy) * depth / fy
        let local = SIMD3<Float>(xCam, yCam, depth)

        let view = camera.viewMatrix(for: orientation)
        let worldFromCamera = view.inverse
        let p = worldFromCamera * SIMD4<Float>(local.x, local.y, local.z, 1)
        return SIMD3<Float>(p.x, p.y, p.z)
    }
}
