import Foundation

/// Dart score payload matching web `ThrowInput`.
struct NativeThrowInput: Equatable {
    enum Segment: Equatable {
        case number(Int)
        case miss
        case bull25
        case bull50

        var json: Any {
            switch self {
            case .number(let n): return n
            case .miss: return "miss"
            case .bull25: return "bull25"
            case .bull50: return "bull50"
            }
        }
    }

    var segment: Segment
    var multiplier: Int
    var confidence: Double

    var segmentJson: Any { segment.json }
}

struct BoardPlane {
    /// Center of the board in world meters (ARKit).
    var center: SIMD3<Float>
    /// Unit normal pointing roughly toward the camera.
    var normal: SIMD3<Float>
    /// Outer double radius in meters (standard ≈ 0.170).
    var radius: Float
    /// World "up" on the board plane used for angle 0 = segment 20.
    var up: SIMD3<Float>
}
