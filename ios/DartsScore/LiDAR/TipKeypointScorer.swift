import Foundation
import CoreML
import UIKit
import ARKit
import simd
import CoreVideo
import CoreImage

/// Dart-sense path: center-square crop → YOLO tip+calib → H → board-plane score.
/// Color bull surround is NOT used (it locked onto red segments).
final class TipKeypointScorer {
    private var visit = VisitKeypointFSM()
    private var model: DartSense?
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private var workBuffer: CVPixelBuffer?
    private(set) var isWaitingForClear = false
    private(set) var lastDiagnostics = DartScorerDiagnostics()
    private(set) var statusLine: String = "ml:init"
    private var lastDetCount = 0
    private var lastTipCount = 0
    private var lastCalibCount = 0
    private var lastInferAt: TimeInterval = 0
    /// Center-square crop in capturedImage pixels.
    private var cropOrigin = SIMD2<Float>(0, 0)
    private var cropSide: Float = 640
    private let inferInterval: TimeInterval = 0.08
    private(set) var lastTipImage = SIMD2<Float>(0, 0)
    private(set) var lastTipBoardDist: Float = 0

    /// Locked homography (crop-norm → board plane) + image-space circle for overlay.
    private(set) var homography: BoardHomography.Matrix?
    /// 6 slots: 20,3,11,6,9,15 (classes 0,1,2,3,5,6).
    private var calibEma: [BoardHomography.Point2?] = [nil, nil, nil, nil, nil, nil]
    private var calibLockStreak = 0
    private let calibLockNeeded = 5
    private let calibConfThresh: Float = 0.18
    private let tipConfThresh: Float = 0.15
    private var cropScaleIdx = 0
    /// Crop scales relative to min(frame) — multi-scale like dart-sense framing.
    private let cropScales: [Float] = [1.0, 0.78, 0.58]

    var isModelLoaded: Bool { model != nil }
    var isCalibLocked: Bool { homography != nil }

    init() {
        loadModel()
    }

    private func loadModel() {
        do {
            let cfg = MLModelConfiguration()
            cfg.computeUnits = .all
            model = try DartSense(configuration: cfg)
            statusLine = "ml:ready"
        } catch {
            statusLine = "ml:load_err \(error.localizedDescription)"
            model = nil
        }
    }

    func reset() {
        visit.reset()
        visit.beginSettle()
        isWaitingForClear = false
        lastDiagnostics = DartScorerDiagnostics()
        lastDiagnostics.phase = visit.phaseName
        lastDiagnostics.source = "ml+H"
        lastDiagnostics.ready = false
        homography = nil
        calibEma = [nil, nil, nil, nil, nil, nil]
        calibLockStreak = 0
        lastCalibCount = 0
        cropScaleIdx = 0
    }

    func beginWaitingForClear() {
        isWaitingForClear = true
        visit.beginWaitClear()
        lastDiagnostics.waitingClear = true
        lastDiagnostics.phase = "waitClear"
    }

    func cancelWaitingForClear() {
        if visit.committedCount >= 3 {
            beginWaitingForClear()
            return
        }
        isWaitingForClear = false
        visit.cancelWaitClear()
        lastDiagnostics.waitingClear = false
    }

    /// Result of one ML calib attempt (for LidarSession auto-lock).
    struct CalibLockResult {
        var imageCalib: BoardImageCalibration
        var streak: Int
        var need: Int
        var locked: Bool
        var calibCount: Int
    }

    /// Multi-scale center crop → accumulate calib (6 classes) → complete → H.
    func tryLockCalib(frame: ARFrame) -> CalibLockResult? {
        guard model != nil else { return nil }
        if frame.timestamp - lastInferAt < inferInterval { return nil }
        lastInferAt = frame.timestamp

        let srcW = Float(CVPixelBufferGetWidth(frame.capturedImage))
        let srcH = Float(CVPixelBufferGetHeight(frame.capturedImage))
        let fullSide = min(srcW, srcH)
        let fullOrigin = SIMD2((srcW - fullSide) * 0.5, (srcH - fullSide) * 0.5)

        // Canonical crop for scoring/overlay = full center square.
        cropOrigin = fullOrigin
        cropSide = fullSide

        let scale = cropScales[cropScaleIdx % cropScales.count]
        cropScaleIdx += 1
        let side = fullSide * scale
        let origin = SIMD2((srcW - side) * 0.5, (srcH - side) * 0.5)

        guard let inputBuf = Self.makeSquareCrop640(
            from: frame.capturedImage,
            origin: origin,
            side: side,
            context: ciContext,
            reuse: &workBuffer
        ) else { return nil }

        let dets: [Det]
        do {
            let prediction = try model!.prediction(
                image: inputBuf,
                iouThreshold: 0.45,
                confidenceThreshold: 0.08
            )
            dets = Self.decode(confidence: prediction.confidence, coordinates: prediction.coordinates)
        } catch {
            statusLine = "ml:pred_err"
            return nil
        }
        lastDetCount = dets.count

        var slots: [BoardHomography.Point2?] = [nil, nil, nil, nil, nil, nil]
        var bestConf = [Float](repeating: 0, count: 6)
        var clsHist = [Int](repeating: 0, count: 7)
        for d in dets {
            if d.cls >= 0 && d.cls < 7 { clsHist[d.cls] += 1 }
            // Map YOLO class → calib slot (skip dart=4).
            let slot: Int?
            switch d.cls {
            case 0, 1, 2, 3: slot = d.cls
            case 5: slot = 4 // 9
            case 6: slot = 5 // 15
            default: slot = nil
            }
            guard let s = slot, d.conf >= calibConfThresh else { continue }
            // Remap detection from this scale-crop → full-center-normalized.
            let imgX = origin.x + d.cx * side
            let imgY = origin.y + d.cy * side
            let nx = (imgX - fullOrigin.x) / fullSide
            let ny = (imgY - fullOrigin.y) / fullSide
            guard nx >= 0, nx <= 1, ny >= 0, ny <= 1 else { continue }
            if d.conf >= bestConf[s] {
                bestConf[s] = d.conf
                slots[s] = BoardHomography.Point2(x: nx, y: ny)
            }
        }

        // EMA — keep old points (model rarely sees all classes in one frame).
        let alpha: Float = 0.40
        for i in 0..<6 {
            if let p = slots[i] {
                if let prev = calibEma[i] {
                    calibEma[i] = BoardHomography.Point2(
                        x: prev.x * (1 - alpha) + p.x * alpha,
                        y: prev.y * (1 - alpha) + p.y * alpha
                    )
                } else {
                    calibEma[i] = p
                }
            }
        }

        let realCount = calibEma.compactMap { $0 }.count
        lastCalibCount = realCount
        let completed = BoardHomography.completeCalib(calibEma)
        let filled = completed.compactMap { $0 }.count
        statusLine =
            "ml:calib \(realCount)/6~\(filled) det=\(lastDetCount) sc=\(String(format: "%.2f", scale)) c=\(clsHist.map(String.init).joined(separator: ","))"

        guard realCount >= 2, let H = BoardHomography.fromCalib(completed) else {
            calibLockStreak = max(0, calibLockStreak - 1)
            lastDiagnostics.phase = "calibrating"
            lastDiagnostics.rejectReason = "calib_\(realCount)/6"
            lastDiagnostics.source = "ml+H"
            return nil
        }

        let pts = completed.compactMap { $0 }
        guard let circle = BoardHomography.circleFromCalib(pts) else {
            calibLockStreak = max(0, calibLockStreak - 1)
            return nil
        }

        calibLockStreak += 1
        let imgCx = fullOrigin.x + circle.cx * fullSide
        let imgCy = fullOrigin.y + circle.cy * fullSide
        let imgR = circle.r * fullSide

        // Prefer real class-0 (20) for up; else completed[0].
        let upSrc = calibEma[0] ?? completed[0]
        var upX: Float = 0, upY: Float = -1
        if let p20 = upSrc {
            upX = (fullOrigin.x + p20.x * fullSide) - imgCx
            upY = (fullOrigin.y + p20.y * fullSide) - imgCy
            let upLen = hypot(upX, upY)
            if upLen > 1 { upX /= upLen; upY /= upLen }
        }

        let imgCalib = BoardImageCalibration(
            cx: imgCx,
            cy: imgCy,
            radiusPx: imgR,
            upX: upX,
            upY: upY,
            imageWidth: srcW,
            imageHeight: srcH
        )

        let locked = calibLockStreak >= calibLockNeeded
        if locked {
            homography = H
            statusLine = "ml:H locked real=\(realCount)"
        }

        lastDiagnostics.phase = locked ? "listen" : "calibrating"
        lastDiagnostics.rejectReason = locked ? "" : "calib_lock \(calibLockStreak)/\(calibLockNeeded)"
        lastDiagnostics.source = "ml+H"
        lastDiagnostics.ready = locked

        return CalibLockResult(
            imageCalib: imgCalib,
            streak: min(calibLockStreak, calibLockNeeded),
            need: calibLockNeeded,
            locked: locked,
            calibCount: realCount
        )
    }

    func analyze(frame: ARFrame, imageCalib: BoardImageCalibration) -> DartScorerOutcome {
        guard model != nil else {
            lastDiagnostics.rejectReason = "no_model"
            lastDiagnostics.phase = "no_model"
            lastDiagnostics.source = "ml"
            return .none
        }
        guard let H = homography else {
            lastDiagnostics.rejectReason = "no_H"
            lastDiagnostics.phase = "calibrating"
            return .none
        }

        if frame.timestamp - lastInferAt < inferInterval {
            return .none
        }
        lastInferAt = frame.timestamp

        let srcW = Float(CVPixelBufferGetWidth(frame.capturedImage))
        let srcH = Float(CVPixelBufferGetHeight(frame.capturedImage))
        let fullSide = min(srcW, srcH)
        cropOrigin = SIMD2((srcW - fullSide) * 0.5, (srcH - fullSide) * 0.5)
        cropSide = fullSide
        guard let inputBuf = Self.makeSquareCrop640(
            from: frame.capturedImage,
            origin: cropOrigin,
            side: fullSide,
            context: ciContext,
            reuse: &workBuffer
        ) else {
            lastDiagnostics.rejectReason = "resize_fail"
            return .none
        }

        let prediction: DartSenseOutput
        do {
            prediction = try model!.prediction(
                image: inputBuf,
                iouThreshold: 0.40,
                confidenceThreshold: 0.12
            )
        } catch {
            lastDiagnostics.rejectReason = "pred_fail"
            statusLine = "ml:pred_err"
            return .none
        }

        let dets = Self.decode(confidence: prediction.confidence, coordinates: prediction.coordinates)
        lastDetCount = dets.count

        var imageTips: [SIMD2<Float>] = []
        var tipConf: [Float] = []
        var clsHist = [Int](repeating: 0, count: 7)
        var filteredOut = 0
        let side = max(cropSide, 1)
        for d in dets {
            if d.cls >= 0 && d.cls < 7 { clsHist[d.cls] += 1 }
            guard d.cls == 4, d.conf >= tipConfThresh else { continue }
            let ix = cropOrigin.x + d.cx * side
            let iy = cropOrigin.y + d.cy * side
            guard ix >= 0, iy >= 0, ix < srcW, iy < srcH else { continue }
            // Prefer board circle slack from locked calib (same space as overlay).
            guard imageCalib.contains(imageX: ix, imageY: iy, slack: 1.15) else {
                filteredOut += 1
                continue
            }
            imageTips.append(SIMD2(ix, iy))
            tipConf.append(d.conf)
        }
        lastTipCount = imageTips.count

        let events = visit.push(imageTips: imageTips, tipConf: tipConf)
        let phase = visit.phaseName
        let tipXY = imageTips.prefix(3).map { "\(Int($0.x)),\(Int($0.y))" }.joined(separator: ";")
        statusLine =
            "ml:\(phase) tips=\(lastTipCount) det=\(lastDetCount) out=\(filteredOut) xy=\(tipXY.isEmpty ? "-" : tipXY) c=\(clsHist.map(String.init).joined(separator: ","))"
        lastDiagnostics.source = "ml+H"
        lastDiagnostics.ready = phase == "listen" || phase == "waitClear"
        lastDiagnostics.phase = phase
        lastDiagnostics.dartsInVisit = visit.committedCount
        lastDiagnostics.waitingClear = isWaitingForClear
        lastDiagnostics.emptyCaptured = imageTips.isEmpty
        lastDiagnostics.rgbPixels = lastTipCount
        lastDiagnostics.rejectReason = phase == "settle" ? "settle" : ""

        for e in events {
            switch e {
            case .score(let tip):
                lastTipImage = tip
                // Tip in crop-normalized coords for H.
                let nx = (tip.x - cropOrigin.x) / side
                let ny = (tip.y - cropOrigin.y) / side
                let bp = BoardHomography.apply(H, BoardHomography.Point2(x: nx, y: ny))
                lastTipBoardDist = hypot(bp.x - 0.5, bp.y - 0.5) / BoardHomography.outerDoubleR
                let scored = BoardHomography.scoreBoardPlane(bp)
                if visit.committedCount >= 3 { isWaitingForClear = true }
                return .scored(scored)
            case .waitRemoval:
                isWaitingForClear = true
            case .boardCleared:
                isWaitingForClear = false
                return .boardCleared
            case .ready:
                lastDiagnostics.ready = true
            case .calibProgress:
                break
            }
        }
        return .none
    }

    private struct Det {
        var cls: Int
        var conf: Float
        var cx: Float
        var cy: Float
    }

    private static func decode(confidence: MLMultiArray, coordinates: MLMultiArray) -> [Det] {
        let n = confidence.shape[0].intValue
        let nc = confidence.shape.count > 1 ? confidence.shape[1].intValue : 0
        guard n > 0, nc > 0,
              coordinates.shape[0].intValue == n,
              coordinates.shape[1].intValue >= 2
        else { return [] }

        let confPtr = confidence.dataPointer.bindMemory(to: Float.self, capacity: n * nc)
        let coordPtr = coordinates.dataPointer.bindMemory(to: Float.self, capacity: n * 4)
        var out: [Det] = []
        out.reserveCapacity(min(n, 32))
        for i in 0..<n {
            var bestCls = 0
            var best: Float = 0
            let base = i * nc
            for c in 0..<nc {
                let v = confPtr[base + c]
                if v > best {
                    best = v
                    bestCls = c
                }
            }
            guard best >= 0.12 else { continue }
            out.append(Det(
                cls: bestCls,
                conf: best,
                cx: min(1, max(0, coordPtr[i * 4 + 0])),
                cy: min(1, max(0, coordPtr[i * 4 + 1]))
            ))
        }
        return out
    }

    /// Square crop at `origin`/`side` → 640×640 (dart-sense style).
    private static func makeSquareCrop640(
        from src: CVPixelBuffer,
        origin: SIMD2<Float>,
        side: Float,
        context: CIContext,
        reuse: inout CVPixelBuffer?
    ) -> CVPixelBuffer? {
        let srcW = Float(CVPixelBufferGetWidth(src))
        let srcH = Float(CVPixelBufferGetHeight(src))
        guard srcW > 32, srcH > 32, side > 16 else { return nil }

        if reuse == nil {
            var buf: CVPixelBuffer?
            let attrs: [String: Any] = [
                kCVPixelBufferCGImageCompatibilityKey as String: true,
                kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
                kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
            ]
            CVPixelBufferCreate(
                kCFAllocatorDefault, 640, 640,
                kCVPixelFormatType_32BGRA,
                attrs as CFDictionary,
                &buf
            )
            reuse = buf
        }
        guard let dst = reuse else { return nil }

        let ci = CIImage(cvPixelBuffer: src)
        let flipped = ci.transformed(
            by: CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: CGFloat(srcH))
        )
        let cropRect = CGRect(
            x: CGFloat(origin.x),
            y: CGFloat(origin.y),
            width: CGFloat(side),
            height: CGFloat(side)
        )
        let cropped = flipped.cropped(to: cropRect)
            .transformed(by: CGAffineTransform(
                translationX: -cropRect.origin.x,
                y: -cropRect.origin.y
            ))
        let s = 640.0 / CGFloat(side)
        let scaled = cropped.transformed(by: CGAffineTransform(scaleX: s, y: s))
            .composited(over: CIImage(color: .black).cropped(to: CGRect(x: 0, y: 0, width: 640, height: 640)))

        context.render(
            scaled,
            to: dst,
            bounds: CGRect(x: 0, y: 0, width: 640, height: 640),
            colorSpace: CGColorSpaceCreateDeviceRGB()
        )
        return dst
    }
}

// MARK: - Visit FSM

private final class VisitKeypointFSM {
    enum Phase { case settle, listen, waitClear }
    private(set) var phase: Phase = .settle
    private var committed: [SIMD2<Float>] = []
    private var pending: [(img: SIMD2<Float>, hits: Int, miss: Int, conf: Float)] = []
    private var ghosts: [SIMD2<Float>] = []
    private var settleHits: [(img: SIMD2<Float>, n: Int)] = []
    private var settleFrames = 0
    private var clearStreak = 0
    private let confirmFrames = 2
    private let clearFrames = 8
    private let settleNeeded = 12
    private let tipEpsPx: Float = 26
    private let maxMiss = 4

    var phaseName: String {
        switch phase {
        case .settle: return "settle"
        case .listen: return "listen"
        case .waitClear: return "waitClear"
        }
    }

    var committedCount: Int { committed.count }

    enum Event {
        case calibProgress(Int, Int)
        case ready
        case score(SIMD2<Float>)
        case waitRemoval
        case boardCleared
    }

    func reset() {
        phase = .settle
        committed = []
        pending = []
        ghosts = []
        settleHits = []
        settleFrames = 0
        clearStreak = 0
    }

    func beginSettle() {
        phase = .settle
        committed = []
        pending = []
        ghosts = []
        settleHits = []
        settleFrames = 0
        clearStreak = 0
    }

    func beginWaitClear() {
        phase = .waitClear
        clearStreak = 0
        pending = []
    }

    func cancelWaitClear() {
        if committed.count >= 3 {
            beginWaitClear()
            return
        }
        phase = .listen
        clearStreak = 0
    }

    private func isGhost(_ tip: SIMD2<Float>) -> Bool {
        ghosts.contains { simd_distance($0, tip) < tipEpsPx }
    }

    func push(imageTips: [SIMD2<Float>], tipConf: [Float]) -> [Event] {
        var events: [Event] = []

        if phase == .settle {
            settleFrames += 1
            for tip in imageTips {
                if let i = settleHits.firstIndex(where: { simd_distance($0.img, tip) < tipEpsPx }) {
                    var h = settleHits[i]
                    h.n += 1
                    h.img = (h.img * Float(h.n - 1) + tip) / Float(h.n)
                    settleHits[i] = h
                } else {
                    settleHits.append((tip, 1))
                }
            }
            events.append(.calibProgress(min(settleFrames, settleNeeded), settleNeeded))
            if settleFrames >= settleNeeded {
                let minHits = max(3, settleNeeded * 2 / 5)
                ghosts = settleHits.filter { $0.n >= minHits }.map(\.img)
                settleHits = []
                phase = .listen
                events.append(.ready)
            }
            return events
        }

        if phase == .waitClear {
            if imageTips.filter({ !isGhost($0) }).isEmpty {
                clearStreak += 1
                if clearStreak >= clearFrames {
                    committed = []
                    pending = []
                    clearStreak = 0
                    phase = .listen
                    events.append(.boardCleared)
                }
            } else {
                clearStreak = 0
            }
            return events
        }

        var next: [(img: SIMD2<Float>, hits: Int, miss: Int, conf: Float)] = []
        var matched = [Bool](repeating: false, count: pending.count)

        for (i, tip) in imageTips.enumerated() {
            if isGhost(tip) { continue }
            if committed.contains(where: { simd_distance($0, tip) < tipEpsPx }) { continue }
            if let idx = pending.firstIndex(where: { simd_distance($0.img, tip) < tipEpsPx }) {
                var p = pending[idx]
                p.hits += 1
                p.miss = 0
                p.img = (p.img * Float(p.hits - 1) + tip) / Float(p.hits)
                p.conf += tipConf.indices.contains(i) ? tipConf[i] : 0.8
                next.append(p)
                matched[idx] = true
            } else {
                next.append((tip, 1, 0, tipConf.indices.contains(i) ? tipConf[i] : 0.8))
            }
        }
        for (idx, p) in pending.enumerated() where !matched[idx] {
            var kept = p
            kept.miss += 1
            if kept.miss <= maxMiss {
                next.append(kept)
            }
        }
        pending = next

        for p in pending where p.hits >= confirmFrames {
            if committed.count >= 3 { break }
            if committed.contains(where: { simd_distance($0, p.img) < tipEpsPx }) { continue }
            committed.append(p.img)
            pending.removeAll { simd_distance($0.img, p.img) < tipEpsPx }
            events.append(.score(p.img))
        }

        if committed.count >= 3 {
            phase = .waitClear
            clearStreak = 0
            pending = []
            events.append(.waitRemoval)
        }
        return events
    }
}
