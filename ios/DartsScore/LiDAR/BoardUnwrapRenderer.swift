import Foundation
import CoreImage
import CoreVideo
import UIKit
import simd
import ARKit

/// Live vision frames for the LAN MJPEG stream (browser / TV).
enum BoardUnwrapRenderer {
    private static let ci = CIContext(options: [.useSoftwareRenderer: false])

    struct TipMark {
        var boardX: Float
        var boardY: Float
        var label: String?
    }

    /// Full camera frame (letterboxed) + live BoardDisk box + locked calib ring.
    /// This is the honest diagnostic — wrong lock is obvious.
    static func jpegOverview(
        frame: ARFrame,
        disk: (cx: Float, cy: Float, r: Float, conf: Float)?,
        calib: BoardImageCalibration?,
        size: Int = 480
    ) -> Data? {
        let src = frame.capturedImage
        let srcW = CVPixelBufferGetWidth(src)
        let srcH = CVPixelBufferGetHeight(src)
        guard srcW > 32, srcH > 32 else { return nil }

        // Fit full frame into size×size letterbox.
        let scale = min(Float(size) / Float(srcW), Float(size) / Float(srcH))
        let dw = max(1, Int((Float(srcW) * scale).rounded()))
        let dh = max(1, Int((Float(srcH) * scale).rounded()))
        let ox = (size - dw) / 2
        let oy = (size - dh) / 2

        var rgba = [UInt8](repeating: 20, count: size * size * 4)
        for i in stride(from: 3, to: rgba.count, by: 4) { rgba[i] = 255 }

        CVPixelBufferLockBaseAddress(src, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(src, .readOnly) }
        guard CVPixelBufferGetPlaneCount(src) >= 2,
              let yPlane = CVPixelBufferGetBaseAddressOfPlane(src, 0),
              let uvPlane = CVPixelBufferGetBaseAddressOfPlane(src, 1)
        else { return nil }
        let yStride = CVPixelBufferGetBytesPerRowOfPlane(src, 0)
        let uvStride = CVPixelBufferGetBytesPerRowOfPlane(src, 1)

        for py in 0..<dh {
            let sy = min(srcH - 1, Int((Float(py) / Float(dh) * Float(srcH)).rounded()))
            for px in 0..<dw {
                let sx = min(srcW - 1, Int((Float(px) / Float(dw) * Float(srcW)).rounded()))
                let (r, g, b) = sampleYUV(
                    yPlane: yPlane, uvPlane: uvPlane,
                    yStride: yStride, uvStride: uvStride,
                    x: sx, y: sy
                )
                let outX = ox + px
                let outY = oy + py
                let i = (outY * size + outX) * 4
                rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255
            }
        }

        func mapX(_ x: Float) -> Int { ox + Int((x * scale).rounded()) }
        func mapY(_ y: Float) -> Int { oy + Int((y * scale).rounded()) }

        if let disk {
            let c = (mapX(disk.cx), mapY(disk.cy))
            let rr = max(4, Int((disk.r * scale).rounded()))
            strokeCirclePx(&rgba, size: size, cx: c.0, cy: c.1, radius: rr, color: (0, 220, 255))
            // conf bar
            let barW = Int((Float(rr) * 2 * min(1, disk.conf)).rounded())
            for x in (c.0 - rr)..<(c.0 - rr + barW) {
                drawDot(&rgba, size: size, cx: x, cy: c.1 + rr + 6, radius: 2, color: (0, 220, 255))
            }
        }
        if let calib {
            let c = (mapX(calib.cx), mapY(calib.cy))
            let rr = max(4, Int((calib.radiusPx * scale).rounded()))
            strokeCirclePx(&rgba, size: size, cx: c.0, cy: c.1, radius: rr, color: (255, 220, 40))
            drawCross(&rgba, size: size, cx: c.0, cy: c.1, arm: 10, color: (255, 60, 60))
        }

        return encodeJPEG(rgba: rgba, size: size)
    }

    /// Tight camera crop around locked circle — YUV, same coords as BoardDisk (no CI flip).
    static func jpegFromCircle(
        frame: ARFrame,
        calib: BoardImageCalibration,
        size: Int = 360
    ) -> Data? {
        let src = frame.capturedImage
        let srcW = CVPixelBufferGetWidth(src)
        let srcH = CVPixelBufferGetHeight(src)
        let side = max(calib.radiusPx * 2.3, 64)
        let x0 = calib.cx - side * 0.5
        let y0 = calib.cy - side * 0.5

        var rgba = [UInt8](repeating: 0, count: size * size * 4)
        CVPixelBufferLockBaseAddress(src, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(src, .readOnly) }
        guard CVPixelBufferGetPlaneCount(src) >= 2,
              let yPlane = CVPixelBufferGetBaseAddressOfPlane(src, 0),
              let uvPlane = CVPixelBufferGetBaseAddressOfPlane(src, 1)
        else { return nil }
        let yStride = CVPixelBufferGetBytesPerRowOfPlane(src, 0)
        let uvStride = CVPixelBufferGetBytesPerRowOfPlane(src, 1)
        let s = Float(size)

        for py in 0..<size {
            for px in 0..<size {
                let ix = x0 + (Float(px) + 0.5) / s * side
                let iy = y0 + (Float(py) + 0.5) / s * side
                let out = (py * size + px) * 4
                let dx = ix - calib.cx
                let dy = iy - calib.cy
                if hypot(dx, dy) > calib.radiusPx * 1.05 {
                    rgba[out + 3] = 0
                    continue
                }
                guard ix >= 0, iy >= 0, ix < Float(srcW - 1), iy < Float(srcH - 1) else {
                    rgba[out + 3] = 0
                    continue
                }
                let (r, g, b) = sampleYUV(
                    yPlane: yPlane, uvPlane: uvPlane,
                    yStride: yStride, uvStride: uvStride,
                    x: Int(ix), y: Int(iy)
                )
                rgba[out] = r; rgba[out + 1] = g; rgba[out + 2] = b; rgba[out + 3] = 255
            }
        }
        strokeCirclePx(
            &rgba, size: size,
            cx: size / 2, cy: size / 2,
            radius: Int((0.5 / 1.15 * s).rounded()),
            color: (255, 255, 255)
        )
        return encodeJPEG(rgba: rgba, size: size)
    }

    /// Frontal unwrap via H⁻¹ (only when lock is trusted).
    static func jpeg(
        frame: ARFrame,
        H: BoardHomography.Matrix,
        cropOrigin: SIMD2<Float>,
        cropSide: Float,
        tips: [TipMark] = [],
        size: Int = 320
    ) -> Data? {
        guard cropSide > 16, let Hinv = BoardHomography.invert(H) else { return nil }
        let src = frame.capturedImage
        let srcW = CVPixelBufferGetWidth(src)
        let srcH = CVPixelBufferGetHeight(src)
        guard srcW > 32, srcH > 32 else { return nil }

        var rgba = [UInt8](repeating: 0, count: size * size * 4)
        let rMax = BoardHomography.outerDoubleR
        let s = Float(size)

        CVPixelBufferLockBaseAddress(src, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(src, .readOnly) }
        guard CVPixelBufferGetPlaneCount(src) >= 2,
              let yPlane = CVPixelBufferGetBaseAddressOfPlane(src, 0),
              let uvPlane = CVPixelBufferGetBaseAddressOfPlane(src, 1)
        else { return nil }
        let yStride = CVPixelBufferGetBytesPerRowOfPlane(src, 0)
        let uvStride = CVPixelBufferGetBytesPerRowOfPlane(src, 1)

        for py in 0..<size {
            for px in 0..<size {
                let bx = (Float(px) + 0.5) / s
                let by = (Float(py) + 0.5) / s
                let dist = hypot(bx - 0.5, by - 0.5)
                let outIdx = (py * size + px) * 4
                if dist > rMax * 1.02 {
                    rgba[outIdx + 3] = 0
                    continue
                }
                let crop = BoardHomography.apply(Hinv, BoardHomography.Point2(x: bx, y: by))
                let ix = cropOrigin.x + crop.x * cropSide
                let iy = cropOrigin.y + crop.y * cropSide
                guard ix >= 0, iy >= 0, ix < Float(srcW - 1), iy < Float(srcH - 1) else {
                    rgba[outIdx + 3] = 0
                    continue
                }
                let (r, g, b) = sampleYUV(
                    yPlane: yPlane, uvPlane: uvPlane,
                    yStride: yStride, uvStride: uvStride,
                    x: Int(ix), y: Int(iy)
                )
                rgba[outIdx] = min(255, r &+ 12)
                rgba[outIdx + 1] = min(255, g &+ 12)
                rgba[outIdx + 2] = min(255, b &+ 12)
                rgba[outIdx + 3] = 255
            }
        }
        for tip in tips {
            drawDot(
                &rgba, size: size,
                cx: Int((tip.boardX * s).rounded()),
                cy: Int((tip.boardY * s).rounded()),
                radius: 5, color: (255, 220, 40)
            )
        }
        strokeCirclePx(
            &rgba, size: size, cx: size / 2, cy: size / 2,
            radius: Int((rMax * s).rounded()), color: (255, 255, 255)
        )
        strokeCirclePx(
            &rgba, size: size, cx: size / 2, cy: size / 2,
            radius: max(3, Int(0.04 * s)), color: (255, 80, 80)
        )
        return encodeJPEG(rgba: rgba, size: size)
    }

    /// Frontal unwrap from the LiDAR plane, cropped at the board edge (number ring
    /// included so misses are visible). Saturated like broadcast views.
    static func jpegPlane(
        frame: ARFrame,
        plane: BoardPlane,
        pose: simd_float4x4? = nil,
        mask: [Bool] = [],
        shadow: [Bool] = [],
        tips: [TipMark] = [],
        size: Int = 400
    ) -> Data? {
        guard let smp = PlaneDartDetector.sample(
            frame: frame, plane: plane, pose: pose, size: size
        ) else {
            return nil
        }
        let maskN = PlaneDartDetector.size
        let hasMask = mask.count == maskN * maskN
        let s = Float(size)
        let edge: Float = 0.5
        var rgba = [UInt8](repeating: 0, count: size * size * 4)
        for py in 0..<size {
            for px in 0..<size {
                let i = py * size + px
                let o = i * 4
                let bx = (Float(px) + 0.5) / s
                let by = (Float(py) + 0.5) / s
                guard smp.valid[i], hypot(bx - 0.5, by - 0.5) <= edge else { continue }
                let yf = (smp.y[i] - 128) * 1.18 + 132 - 16
                let uf = smp.u[i] * 1.7
                let vf = smp.v[i] * 1.7
                var r = yf + 1.402 * vf
                var g = yf - 0.344 * uf - 0.714 * vf
                var b = yf + 1.772 * uf
                if hasMask {
                    let mx = min(maskN - 1, Int(bx * Float(maskN)))
                    let my = min(maskN - 1, Int(by * Float(maskN)))
                    let mi = my * maskN + mx
                    if shadow.count == mask.count, shadow[mi] {
                        r *= 0.45
                        g = g * 0.45 + 120 * 0.55
                        b = b * 0.45 + 255 * 0.55
                    } else if mask[mi] {
                        r = r * 0.45 + 255 * 0.55
                        g *= 0.45
                        b = b * 0.45 + 200 * 0.55
                    }
                }
                rgba[o] = UInt8(max(0, min(255, r)))
                rgba[o + 1] = UInt8(max(0, min(255, g)))
                rgba[o + 2] = UInt8(max(0, min(255, b)))
                rgba[o + 3] = 255
            }
        }
        for tip in tips {
            let cx = Int((tip.boardX * s).rounded())
            let cy = Int((tip.boardY * s).rounded())
            drawDot(&rgba, size: size, cx: cx, cy: cy, radius: 6, color: (0, 0, 0))
            drawDot(&rgba, size: size, cx: cx, cy: cy, radius: 4, color: (255, 230, 0))
        }
        strokeCirclePx(
            &rgba, size: size, cx: size / 2, cy: size / 2,
            radius: Int((BoardHomography.outerDoubleR * s).rounded()), color: (60, 255, 140)
        )
        return encodeJPEG(rgba: rgba, size: size)
    }

    /// Lossless PNG of an unwrap sample (offline tuning / dataset).
    static func png(sample smp: PlaneDartDetector.Sample, size: Int = PlaneDartDetector.size) -> Data? {
        guard smp.y.count == size * size else { return nil }
        var rgba = [UInt8](repeating: 0, count: size * size * 4)
        for i in 0..<(size * size) where smp.valid[i] {
            let yf = smp.y[i] - 16, uf = smp.u[i], vf = smp.v[i]
            let o = i * 4
            rgba[o] = UInt8(max(0, min(255, yf + 1.402 * vf)))
            rgba[o + 1] = UInt8(max(0, min(255, yf - 0.344 * uf - 0.714 * vf)))
            rgba[o + 2] = UInt8(max(0, min(255, yf + 1.772 * uf)))
            rgba[o + 3] = 255
        }
        guard let provider = CGDataProvider(data: Data(rgba) as CFData),
              let cg = CGImage(
                width: size, height: size,
                bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: size * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
              )
        else { return nil }
        return UIImage(cgImage: cg).pngData()
    }

    // MARK: - Helpers

    private static func sampleYUV(
        yPlane: UnsafeMutableRawPointer,
        uvPlane: UnsafeMutableRawPointer,
        yStride: Int,
        uvStride: Int,
        x: Int,
        y: Int
    ) -> (UInt8, UInt8, UInt8) {
        let Y = yPlane.load(fromByteOffset: y * yStride + x, as: UInt8.self)
        let uvX = (x / 2) * 2
        let uvY = y / 2
        let u = uvPlane.load(fromByteOffset: uvY * uvStride + uvX, as: UInt8.self)
        let v = uvPlane.load(fromByteOffset: uvY * uvStride + uvX + 1, as: UInt8.self)
        let yf = Float(Y) - 16
        let uf = Float(u) - 128
        let vf = Float(v) - 128
        let rf = yf + 1.402 * vf
        let gf = yf - 0.344 * uf - 0.714 * vf
        let bf = yf + 1.772 * uf
        return (
            UInt8(max(0, min(255, Int(rf)))),
            UInt8(max(0, min(255, Int(gf)))),
            UInt8(max(0, min(255, Int(bf))))
        )
    }

    private static func encodeJPEG(rgba: [UInt8], size: Int) -> Data? {
        guard let provider = CGDataProvider(data: Data(rgba) as CFData),
              let cg = CGImage(
                width: size, height: size,
                bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: size * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
              )
        else { return nil }
        return UIImage(cgImage: cg).jpegData(compressionQuality: 0.7)
    }

    private static func drawDot(
        _ rgba: inout [UInt8], size: Int, cx: Int, cy: Int, radius: Int,
        color: (UInt8, UInt8, UInt8)
    ) {
        for dy in -radius...radius {
            for dx in -radius...radius {
                guard dx * dx + dy * dy <= radius * radius else { continue }
                let x = cx + dx, y = cy + dy
                guard x >= 0, y >= 0, x < size, y < size else { continue }
                let i = (y * size + x) * 4
                rgba[i] = color.0; rgba[i + 1] = color.1; rgba[i + 2] = color.2; rgba[i + 3] = 255
            }
        }
    }

    private static func drawCross(
        _ rgba: inout [UInt8], size: Int, cx: Int, cy: Int, arm: Int,
        color: (UInt8, UInt8, UInt8)
    ) {
        for d in -arm...arm {
            drawDot(&rgba, size: size, cx: cx + d, cy: cy, radius: 1, color: color)
            drawDot(&rgba, size: size, cx: cx, cy: cy + d, radius: 1, color: color)
        }
    }

    private static func strokeCirclePx(
        _ rgba: inout [UInt8], size: Int, cx: Int, cy: Int, radius: Int,
        color: (UInt8, UInt8, UInt8)
    ) {
        guard radius > 1 else { return }
        for a in stride(from: 0, to: 360, by: 2) {
            let rad = Float(a) * .pi / 180
            let x = cx + Int((Float(radius) * cos(rad)).rounded())
            let y = cy + Int((Float(radius) * sin(rad)).rounded())
            drawDot(&rgba, size: size, cx: x, cy: y, radius: 1, color: color)
        }
    }
}
