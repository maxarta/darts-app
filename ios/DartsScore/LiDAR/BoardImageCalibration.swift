import Foundation
import simd
import ARKit

/// 2D board model in `capturedImage` pixels — this is what we score against.
/// LiDAR only supplies metric scale (170 mm → radiusPx) and the "20" up direction.
struct BoardImageCalibration {
    var cx: Float
    var cy: Float
    var radiusPx: Float
    /// Unit vector in image space from bull toward segment 20.
    var upX: Float
    var upY: Float
    var imageWidth: Float
    var imageHeight: Float

    /// Build image calibration by projecting the LiDAR-locked plane into the camera image.
    static func from(plane: BoardPlane, camera: ARCamera) -> BoardImageCalibration? {
        guard let c = project(world: plane.center, camera: camera) else { return nil }
        let edgeWorld = plane.center + plane.up * plane.radius
        guard let e = project(world: edgeWorld, camera: camera) else { return nil }

        var upX = e.x - c.x
        var upY = e.y - c.y
        let len = hypot(upX, upY)
        guard len > 8 else { return nil }
        upX /= len
        upY /= len

        let res = camera.imageResolution
        return BoardImageCalibration(
            cx: c.x,
            cy: c.y,
            radiusPx: len,
            upX: upX,
            upY: upY,
            imageWidth: Float(res.width),
            imageHeight: Float(res.height)
        )
    }

    /// RGB-only fallback when plane→image projection fails (tripod auto-calib).
    /// `up` = toward top of image (segment 20 assumed upright on wall).
    static func fromBullImage(
        cx: Float,
        cy: Float,
        radiusPx: Float,
        imageWidth: Float,
        imageHeight: Float
    ) -> BoardImageCalibration? {
        guard radiusPx > 12, imageWidth > 32, imageHeight > 32 else { return nil }
        return BoardImageCalibration(
            cx: cx,
            cy: cy,
            radiusPx: radiusPx,
            upX: 0,
            upY: -1, // image y↓ → up is −Y
            imageWidth: imageWidth,
            imageHeight: imageHeight
        )
    }

    /// Score a tip in capturedImage pixel coordinates (same math as web `scoreFromNormalizedPoint`).
    func score(imageX: Float, imageY: Float) -> NativeThrowInput {
        let dx = imageX - cx
        let dy = imageY - cy
        let dist = hypot(dx, dy) / max(radiusPx, 1e-3)

        if dist > 1.08 {
            return NativeThrowInput(segment: .miss, multiplier: 1, confidence: 0.55)
        }

        // Same convention as web `scoreFromNormalizedPoint`: 0 = up (20), clockwise.
        // Express tip in the board basis, then atan2(right, up).
        // In image (y↓): CW 90° from up → right = (-upY, upX).
        let rx = -upY
        let ry = upX
        let alongRight = dx * rx + dy * ry
        let alongUp = dx * upX + dy * upY

        var angle = atan2(alongRight, alongUp)
        if angle < 0 { angle += .pi * 2 }
        let wedge = Float.pi * 2 / 20
        let idx = Int(floor((angle + wedge / 2) / wedge)) % 20
        let segment = BoardPlaneEstimator.segments[(idx + 20) % 20]

        if dist <= BoardPlaneEstimator.rDB {
            return NativeThrowInput(segment: .bull50, multiplier: 1, confidence: 0.9)
        }
        if dist <= BoardPlaneEstimator.rSB {
            return NativeThrowInput(segment: .bull25, multiplier: 1, confidence: 0.85)
        }
        if dist >= BoardPlaneEstimator.rTripleIn && dist < BoardPlaneEstimator.rTripleOut {
            return NativeThrowInput(segment: .number(segment), multiplier: 3, confidence: 0.78)
        }
        if dist >= BoardPlaneEstimator.rDoubleIn && dist <= 1.05 {
            return NativeThrowInput(segment: .number(segment), multiplier: 2, confidence: 0.78)
        }
        return NativeThrowInput(segment: .number(segment), multiplier: 1, confidence: 0.72)
    }

    func contains(imageX: Float, imageY: Float, slack: Float = 1.12) -> Bool {
        let dx = imageX - cx
        let dy = imageY - cy
        return hypot(dx, dy) <= radiusPx * slack
    }

    private static func project(world: SIMD3<Float>, camera: ARCamera) -> (x: Float, y: Float)? {
        let view = camera.transform.inverse
        let p = view * SIMD4<Float>(world.x, world.y, world.z, 1)
        guard p.z < -0.05 else { return nil }
        let fx = camera.intrinsics[0, 0]
        let fy = camera.intrinsics[1, 1]
        let cx = camera.intrinsics[2, 0]
        let cy = camera.intrinsics[2, 1]
        let u = fx * (p.x / -p.z) + cx
        let v = fy * (-p.y / -p.z) + cy
        let res = camera.imageResolution
        guard u.isFinite, v.isFinite else { return nil }
        guard u >= -50, v >= -50,
              u < Float(res.width) + 50,
              v < Float(res.height) + 50 else { return nil }
        return (u, v)
    }
}
