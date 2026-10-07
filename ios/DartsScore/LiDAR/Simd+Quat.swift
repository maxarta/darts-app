import simd

extension simd_quatf {
    /// Shortest rotation taking `from` → `to`.
    init(from: SIMD3<Float>, to: SIMD3<Float>) {
        let f = simd_normalize(from)
        let t = simd_normalize(to)
        let dot = simd_dot(f, t)
        if dot > 0.9999 {
            self = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
            return
        }
        if dot < -0.9999 {
            var axis = simd_cross(f, SIMD3<Float>(1, 0, 0))
            if simd_length(axis) < 1e-4 {
                axis = simd_cross(f, SIMD3<Float>(0, 1, 0))
            }
            self = simd_quatf(angle: .pi, axis: simd_normalize(axis))
            return
        }
        let axis = simd_normalize(simd_cross(f, t))
        let angle = acos(max(-1, min(1, dot)))
        self = simd_quatf(angle: angle, axis: axis)
    }
}
