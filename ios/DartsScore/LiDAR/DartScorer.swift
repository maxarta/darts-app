import Foundation
import simd
import ARKit

/// Detects new darts by watching for depth discontinuities near the board plane.
final class DartScorer {
    private var lastHitAt: TimeInterval = 0
    private let cooldown: TimeInterval = 1.4
    private var baselineDepth: [Float]? = nil
    private var frameCount = 0

    func reset() {
        lastHitAt = 0
        baselineDepth = nil
        frameCount = 0
    }

    func analyze(
        frame: ARFrame,
        plane: BoardPlane,
        orientation: UIInterfaceOrientation
    ) -> NativeThrowInput? {
        let now = frame.timestamp
        if now - lastHitAt < cooldown { return nil }

        guard let depthData = frame.smoothedSceneDepth ?? frame.sceneDepth else {
            return nil
        }

        let depthMap = depthData.depthMap
        let confMap = depthData.confidenceMap
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
        if let confMap {
            CVPixelBufferLockBaseAddress(confMap, .readOnly)
        }
        defer {
            if let confMap {
                CVPixelBufferUnlockBaseAddress(confMap, .readOnly)
            }
        }

        let w = CVPixelBufferGetWidth(depthMap)
        let h = CVPixelBufferGetHeight(depthMap)
        guard let base = CVPixelBufferGetBaseAddress(depthMap) else { return nil }
        let stride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.size
        let depthPtr = base.assumingMemoryBound(to: Float32.self)

        var confPtr: UnsafePointer<UInt8>? = nil
        var confStride = 0
        if let confMap, let cBase = CVPixelBufferGetBaseAddress(confMap) {
            confPtr = UnsafeRawPointer(cBase).assumingMemoryBound(to: UInt8.self)
            confStride = CVPixelBufferGetBytesPerRow(confMap)
        }

        // Build / refresh a sparse baseline of board distances.
        frameCount += 1
        let sampleStep = 4
        var samples: [Float] = []
        samples.reserveCapacity((w * h) / (sampleStep * sampleStep))

        var bestDelta: Float = 0
        var bestX = 0
        var bestY = 0

        for y in stride(from: 0, to: h, by: sampleStep) {
            for x in stride(from: 0, to: w, by: sampleStep) {
                if let confPtr {
                    let c = confPtr[y * confStride + x]
                    // ARConfidenceLevel: 0 low, 1 medium, 2 high
                    if c < 1 { continue }
                }
                let d = depthPtr[y * stride + x]
                guard d.isFinite, d > 0.2, d < 4.5 else { continue }

                guard let world = BoardPlaneEstimator.worldPoint(
                    depthX: x,
                    depthY: y,
                    depth: d,
                    depthWidth: w,
                    depthHeight: h,
                    camera: frame.camera,
                    orientation: orientation
                ) else { continue }

                // Keep points near the board disk.
                let delta = world - plane.center
                let planar = delta - simd_dot(delta, plane.normal) * plane.normal
                let radial = simd_length(planar)
                let along = abs(simd_dot(delta, plane.normal))
                guard radial <= plane.radius * 1.15, along < 0.08 else { continue }

                samples.append(d)

                if let baseline = baselineDepth {
                    let idx = (y / sampleStep) * ((w + sampleStep - 1) / sampleStep) + (x / sampleStep)
                    if idx < baseline.count {
                        let diff = baseline[idx] - d // closer object → positive
                        if diff > 0.012, diff > bestDelta {
                            bestDelta = diff
                            bestX = x
                            bestY = y
                        }
                    }
                }
            }
        }

        if baselineDepth == nil || frameCount % 45 == 0 {
            // Store a coarse baseline grid aligned with sampleStep.
            let cols = (w + sampleStep - 1) / sampleStep
            let rows = (h + sampleStep - 1) / sampleStep
            var grid = [Float](repeating: 0, count: cols * rows)
            var i = 0
            for y in stride(from: 0, to: h, by: sampleStep) {
                for x in stride(from: 0, to: w, by: sampleStep) {
                    let d = depthPtr[y * stride + x]
                    if i < grid.count {
                        grid[i] = d.isFinite ? d : 0
                    }
                    i += 1
                }
            }
            baselineDepth = grid
            return nil
        }

        guard bestDelta > 0.015 else { return nil }

        let d = depthPtr[bestY * stride + bestX]
        guard let world = BoardPlaneEstimator.worldPoint(
            depthX: bestX,
            depthY: bestY,
            depth: d,
            depthWidth: w,
            depthHeight: h,
            camera: frame.camera,
            orientation: orientation
        ) else { return nil }

        // Ray from camera through the tip → score on plane.
        let camPos = SIMD3<Float>(
            frame.camera.transform.columns.3.x,
            frame.camera.transform.columns.3.y,
            frame.camera.transform.columns.3.z
        )
        let dir = simd_normalize(world - camPos)
        guard let scored = BoardPlaneEstimator.score(
            rayOrigin: camPos,
            rayDirection: dir,
            plane: plane
        ) else { return nil }

        lastHitAt = now
        // Refresh baseline so the stuck dart becomes part of the background.
        baselineDepth = nil
        frameCount = 0
        return scored
    }
}
