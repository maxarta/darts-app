import Foundation
import Combine
import ARKit
import RealityKit
import UIKit
import os.log

@MainActor
final class LidarSession: NSObject, ObservableObject {
    static var supportsSceneDepth: Bool {
        ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
    }

    @Published var isRunning = false
    @Published var isScoring = false
    @Published var statusText = "Наведите на мишень"
    @Published var hasLidar: Bool = LidarSession.supportsSceneDepth
    /// World plane locked from close-up bull (tap or auto).
    @Published var bullLocked = false
    /// Ready after «Готово» from tripod (image calib rebuilt at throw distance).
    @Published var tripodReady = false

    /// Manual throw gate: user throws on «Бросай», taps «Бросил» to snapshot-score.
    enum ThrowPrompt: Equatable {
        case throwNow
        case scoring
        case pullDarts
    }
    @Published var throwPrompt: ThrowPrompt = .throwNow
    /// Last snapshot labels for UI (e.g. "T20 · 5 · 1").
    @Published var lastSnapshotLabels: [String] = []

    let arView = ARView(frame: .zero)
    var boardPlane: BoardPlane? {
        didSet {
            tripodPose = boardPlane == nil ? nil : arView.session.currentFrame?.camera.transform
        }
    }
    /// Pose at board lock. Tripod = static camera, so all plane→pixel mapping uses
    /// this pose; ARKit world drift would otherwise slide the unwrap by mm–cm.
    private var tripodPose: simd_float4x4?
    /// 2D board circle in camera image — RGB scores against this.
    var boardImageCalib: BoardImageCalibration?
    private var lastBullAutoAt: TimeInterval = 0
    private var autoLockStreak = 0
    private let autoLockNeeded = 6
    /// Accumulate hits; commit median only when streak completes (stops wander-lock).
    private var lockSamples: [(x: Float, y: Float, r: Float)] = []
    private var depthBoardSamples: [BoardDepthDetector.Result] = []
    private var calibStartedAt: TimeInterval = 0
    var onDartScored: ((NativeThrowInput) -> Void)?
    var onBoardCleared: (() -> Void)?
    /// Fired once board geometry is locked and scoring can begin (ML hybrid / RGB).
    var onReadyForScoring: (() -> Void)?

    private let scorer = DartScorer()
    private let mlScorer = TipKeypointScorer()
    private let boardDisk = BoardDiskScorer()
    /// Empty-board RGB snapshot for «Бросил» tip blobs (not tip-YOLO).
    private let rgbSnap = RgbMotionDetector()
    /// Diff on the LiDAR-rectified board — primary «Бросил» path when a plane is locked.
    private let planeDarts = PlaneDartDetector()
    /// Prefer Core ML tip detection when the model is bundled.
    var usesMlScorer: Bool { mlScorer.isModelLoaded }
    private var coaching: ARCoachingOverlayView?
    private var boardTapRecognizer: UITapGestureRecognizer?
    private var isAnalyzingFrame = false
    private var lastStatusRefresh: TimeInterval = 0
    private var lastDebugLog: TimeInterval = 0
    private var lastVisionAt: TimeInterval = 0
    private var visionBusy = false
    private static let log = OSLog(subsystem: "app.artdart.score", category: "autoscore")
    /// ~8 fps live unwrap for TV MJPEG.
    private let visionInterval: TimeInterval = 0.12

    override init() {
        super.init()
        arView.session.delegate = self
        arView.automaticallyConfigureSession = false
        arView.environment.background = .cameraFeed()
        installBoardTap()
    }

    private func installBoardTap() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleBoardTap(_:)))
        tap.cancelsTouchesInView = false
        arView.addGestureRecognizer(tap)
        boardTapRecognizer = tap
    }

    @objc private func handleBoardTap(_ gesture: UITapGestureRecognizer) {
        // Fully automatic — taps ignored during calibration.
        _ = gesture
    }

    func startPreview() {
        guard Self.supportsSceneDepth else {
            statusText = "LiDAR недоступен на этом устройстве"
            return
        }
        let config = ARWorldTrackingConfiguration()
        // Only vertical walls — horizontal hits look like a "red floor plane".
        config.planeDetection = [.vertical]
        config.environmentTexturing = .automatic
        // Do NOT enable sceneReconstruction mesh: RealityKit draws it as a
        // translucent pink/red overlay that sits in the wrong "dimension".
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            config.frameSemantics.insert(.smoothedSceneDepth)
        }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }
        arView.debugOptions = []
        arView.environment.sceneUnderstanding.options = []
        arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        arView.scene.anchors.removeAll()
        isRunning = true
        isScoring = false
        bullLocked = false
        tripodReady = false
        autoLockStreak = 0
        lockSamples = []
        depthBoardSamples = []
        calibStartedAt = 0
        _ = EmbeddedWebServer.shared.startIfNeeded()
        if let vision = EmbeddedWebServer.shared.visionStreamURL()?.absoluteString {
            liveLog("DARTS_LIVE event=vision_url \(vision)")
            liveLog(
                "DARTS_LIVE event=vision_browser \(vision.replacingOccurrences(of: "/vision.mjpg", with: "/vision.html"))"
            )
        }
        liveLog("DARTS_LIVE mode=preview plane=0 scoring=0 event=start_preview")
        boardPlane = nil
        boardImageCalib = nil
        lastBullAutoAt = 0
        scorer.reset()
        mlScorer.reset()
        rgbSnap.reset()
        planeDarts.reset()
        setCaptureLocked(false)
        statusText = "LiDAR · ищем стену и мишень…"
        installCoaching()
    }

    /// Commit board: prefer LiDAR metric plane → image overlay; RGB circle is fallback only.
    @discardableResult
    func commitCalibFromBull(
        hit: BullDetector.Hit,
        frame: ARFrame,
        markReady: Bool = false
    ) -> Bool {
        let res = frame.camera.imageResolution
        let w = Float(res.width)
        let h = Float(res.height)
        var img = BoardImageCalibration.fromBullImage(
            cx: hit.imageX,
            cy: hit.imageY,
            radiusPx: hit.estimatedBoardRadiusPx,
            imageWidth: w,
            imageHeight: h
        )
        var src = "rgb"

        if let plane = boardPlane,
           let fromPlane = BoardImageCalibration.from(plane: plane, camera: frame.camera),
           fromPlane.radiusPx > 28 {
            img = fromPlane
            src = "lidarPlane"
            liveLog("DARTS_LIVE event=calib_src=plane rPx=\(Int(fromPlane.radiusPx))")
        } else {
            liveLog(
                "DARTS_LIVE event=calib_src=rgb rPx=\(Int(hit.estimatedBoardRadiusPx)) red=\(hit.redPixels) bull=\(Int(hit.imageX)),\(Int(hit.imageY))"
            )
        }
        _ = src

        guard let img else {
            statusText = "Не собрал круг мишени"
            liveLog("DARTS_LIVE event=tripod reject=no_img")
            return false
        }

        let minSide = min(img.imageWidth, img.imageHeight)
        if img.radiusPx > minSide * 0.58 {
            statusText = "Слишком близко — чуть дальше"
            liveLog("DARTS_LIVE event=tripod reject=too_close rPx=\(Int(img.radiusPx))")
            return false
        }
        if img.radiusPx < 24 {
            statusText = "Мишень мелко — чуть ближе"
            liveLog("DARTS_LIVE event=tripod reject=too_far rPx=\(Int(img.radiusPx))")
            return false
        }

        boardImageCalib = img
        bullLocked = true
        if let plane = boardPlane {
            placeGuide(at: plane)
        } else {
            arView.scene.anchors.removeAll()
        }
        statusText = String(format: "Мишень OK · r=%.0f", img.radiusPx)
        liveLog(
            "DARTS_LIVE event=tripod_ok rPx=\(Int(img.radiusPx)) bull=\(Int(img.cx)),\(Int(img.cy)) guide=\(boardPlane != nil ? "plane3d" : "rgb2d")"
        )
        if markReady {
            tripodReady = true
        }
        return true
    }

    /// Project board into ARView: perspective ring (ellipse) when plane locked, else circle.
    func projectCalibToView(viewSize: CGSize) -> (
        center: CGPoint,
        radius: CGFloat,
        ring: [CGPoint],
        calibPts: [CGPoint]
    )? {
        guard let frame = arView.session.currentFrame else { return nil }
        let vs = arView.bounds.size.width > 8 ? arView.bounds.size : viewSize
        guard vs.width > 8, vs.height > 8 else { return nil }

        let res = frame.camera.imageResolution
        let iw = CGFloat(res.width)
        let ih = CGFloat(res.height)
        guard iw > 1, ih > 1 else { return nil }

        let display = frame.displayTransform(for: interfaceOrientation, viewportSize: vs)
        let sx = abs(vs.width - viewSize.width) > 1 ? viewSize.width / vs.width : 1
        let sy = abs(vs.height - viewSize.height) > 1 ? viewSize.height / vs.height : 1

        func toView(_ ix: Float, _ iy: Float) -> CGPoint {
            var p = CGPoint(x: CGFloat(ix) / iw, y: CGFloat(iy) / ih)
            p = p.applying(display)
            return CGPoint(x: p.x * vs.width * sx, y: p.y * vs.height * sy)
        }

        if let plane = boardPlane {
            let ringImg = BoardHomography.outerRingImagePoints(
                plane: plane, camera: frame.camera, samples: 72
            )
            guard ringImg.count >= 8 else { return nil }
            let ring = ringImg.map { toView($0.x, $0.y) }
            var sxSum: CGFloat = 0, sySum: CGFloat = 0
            for p in ring { sxSum += p.x; sySum += p.y }
            let c = CGPoint(x: sxSum / CGFloat(ring.count), y: sySum / CGFloat(ring.count))
            let r = ring.map { hypot($0.x - c.x, $0.y - c.y) }.max() ?? 0
            guard r > 4 else { return nil }
            var calibPts: [CGPoint] = []
            if let pack = BoardHomography.fromPlane(plane, camera: frame.camera) {
                calibPts = pack.imagePts.map { toView($0.x, $0.y) }
            }
            return (c, r, ring, calibPts)
        }

        guard let calib = boardImageCalib else { return nil }
        let c = toView(calib.cx, calib.cy)
        let edge = toView(calib.cx + calib.radiusPx, calib.cy)
        var r = hypot(edge.x - c.x, edge.y - c.y)
        let edgeY = toView(calib.cx, calib.cy + calib.radiusPx)
        r = max(r, hypot(edgeY.x - c.x, edgeY.y - c.y))
        guard r.isFinite, r > 4 else { return nil }
        return (c, r, [], [])
    }

    func startScoring() {
        if !usesMlScorer, boardImageCalib == nil {
            statusText = "Ищем мишень…"
            liveLog("DARTS_LIVE event=start_scoring reject=no_calib")
            return
        }
        if isScoring { return }
        tripodReady = true
        isScoring = true
        scorer.reset()
        mlScorer.reset()
        // reset() clears H — rebuild DartsMind H from plane (was the no_H bug).
        relockHomography()
        throwPrompt = .throwNow
        lastSnapshotLabels = []
        statusText = "Бросай"
        coaching?.removeFromSuperview()
        coaching = nil
        if let frame = arView.session.currentFrame, let calib = boardImageCalib {
            rgbSnap.captureVisitEmpty(frame: frame, calib: calib)
        }
        setCaptureLocked(true)
        captureEmptyBoard()
        liveLog(
            "DARTS_LIVE event=start_scoring mode=planeH+rgbDiff prompt=throwNow empty=\(rgbSnap.hasEmptyReference ? 1 : 0) plane=\(boardPlane != nil ? 1 : 0) H=\(mlScorer.isCalibLocked ? 1 : 0) status=\(mlScorer.statusLine)"
        )
    }

    /// Rebuild tip→board H after any mlScorer.reset().
    private func relockHomography() {
        guard let frame = arView.session.currentFrame else { return }
        if let plane = boardPlane, mlScorer.lockFromPlane(plane, camera: frame.camera) {
            return
        }
        if let img = boardImageCalib {
            _ = mlScorer.lockFromImageCircle(img)
        }
    }

    /// User finished the visit — RGB diff tips → LiDAR plane score (fallback: image circle).
    func userTappedThrown() {
        guard isScoring, throwPrompt == .throwNow else { return }
        guard let frame = arView.session.currentFrame else {
            statusText = "Нет кадра"
            liveLog("DARTS_LIVE event=user_thrown reject=no_frame")
            return
        }
        guard let calib = boardImageCalib else {
            statusText = "Нет калибровки"
            liveLog("DARTS_LIVE event=user_thrown reject=no_calib")
            return
        }

        throwPrompt = .scoring
        statusText = "Считаю…"
        liveLog("DARTS_LIVE event=user_thrown")
        relockHomography()

        if let plane = boardPlane {
            scoreSnapOnPlane(frame: frame, plane: plane)
            return
        }

        if !rgbSnap.hasEmptyReference {
            rgbSnap.captureVisitEmpty(frame: frame, calib: calib)
            throwPrompt = .throwNow
            statusText = "Снял пустую — бросай и жми ещё раз"
            liveLog("DARTS_LIVE event=snap captured_empty_late")
            return
        }

        // Looser image mask under perspective (circle underestimates far side).
        var searchCalib = calib
        searchCalib.radiusPx = calib.radiusPx * 1.45
        let tips = rgbSnap.findAllTips(frame: frame, calib: searchCalib)
        liveLog(
            "DARTS_LIVE event=snap rgb_blobs=\(tips.count) motion=\(rgbSnap.lastMotionPixels) plane=\(boardPlane != nil ? 1 : 0) H=\(mlScorer.isCalibLocked ? 1 : 0)"
        )

        var hits: [NativeThrowInput] = []
        for tip in tips {
            // Prefer plane score (metric); H as cross-check / fallback.
            if let plane = boardPlane {
                let world: SIMD3<Float>? =
                    BoardPlaneEstimator.worldFromImagePixel(
                        imageX: tip.imageX,
                        imageY: tip.imageY,
                        frame: frame,
                        orientation: interfaceOrientation
                    ) ?? {
                        let ray = BoardPlaneEstimator.rayFromImagePixel(
                            imageX: tip.imageX,
                            imageY: tip.imageY,
                            camera: frame.camera
                        )
                        let denom = simd_dot(ray.direction, plane.normal)
                        guard abs(denom) > 1e-5 else { return nil }
                        let t = simd_dot(plane.center - ray.origin, plane.normal) / denom
                        guard t > 0.05, t < 8 else { return nil }
                        return ray.origin + t * ray.direction
                    }()
                if let w = world, let scored = BoardPlaneEstimator.scoreWorldPoint(w, plane: plane) {
                    if case .miss = scored.segment {
                        // Off-board blob — try H; else drop (don't pad with fake misses).
                    } else {
                        hits.append(scored)
                        liveLog(
                            "DARTS_LIVE SCORE SNAP \(label(scored)) src=lidarPlane tip=\(Int(tip.imageX)),\(Int(tip.imageY)) px=\(tip.pixelCount)"
                        )
                        continue
                    }
                }
            }
            // DartsMind path: tip → H
            if let scored = mlScorer.scoreTipImage(SIMD2(tip.imageX, tip.imageY)) {
                if case .miss = scored.segment, tip.radialNorm > 0.92 {
                    continue
                }
                hits.append(scored)
                liveLog(
                    "DARTS_LIVE SCORE SNAP \(label(scored)) src=planeH tip=\(Int(tip.imageX)),\(Int(tip.imageY)) px=\(tip.pixelCount) dist=\(String(format: "%.2f", mlScorer.lastTipBoardDist))"
                )
                continue
            }
        }

        if hits.isEmpty {
            throwPrompt = .throwNow
            statusText = "Не вижу дротики — бросай ещё"
            liveLog("DARTS_LIVE SCORE SNAP empty → retry")
            return
        }

        var labels: [String] = []
        for hit in hits {
            labels.append(label(hit))
            onDartScored?(hit)
        }
        if hits.count < 3 {
            for _ in hits.count..<3 {
                let miss = NativeThrowInput(segment: .miss, multiplier: 1, confidence: 0.35)
                labels.append("МИМО")
                onDartScored?(miss)
            }
        }
        lastSnapshotLabels = labels
        throwPrompt = .pullDarts
        statusText = "Достаньте дротики"
        mlScorer.beginWaitingForClear()
        liveLog("DARTS_LIVE event=wait_removal prompt=pullDarts labels=\(labels.joined(separator: ","))")
    }

    /// Depth disk center is ±1–2 cm; snap to the red bullseye on the unwrap.
    /// Within 35 mm of the bull nothing else on a board is red.
    private func refineCenterOnBull(frame: ARFrame, plane: BoardPlane) -> BoardPlane? {
        let n = PlaneDartDetector.size
        guard let smp = PlaneDartDetector.sample(frame: frame, plane: plane) else { return nil }
        let span = PlaneDartDetector.boardSpan(plane)
        let searchPx = 0.035 / span * Float(n)
        let c = Float(n) * 0.5
        var sx: Float = 0, sy: Float = 0, cnt = 0
        let lo = max(0, Int(c - searchPx)), hi = min(n - 1, Int(c + searchPx))
        for py in lo...hi {
            for px in lo...hi {
                let dx = Float(px) + 0.5 - c, dy = Float(py) + 0.5 - c
                guard dx * dx + dy * dy <= searchPx * searchPx else { continue }
                let i = py * n + px
                guard smp.valid[i] else { continue }
                let u = smp.u[i], v = smp.v[i]
                if v > 22, v > u + 25 {
                    sx += Float(px) + 0.5
                    sy += Float(py) + 0.5
                    cnt += 1
                }
            }
        }
        guard cnt >= 8 else {
            liveLog("DARTS_LIVE event=bull_refine miss red=\(cnt)")
            return nil
        }
        let bx = sx / Float(cnt) / Float(n)
        let by = sy / Float(cnt) / Float(n)
        let right = simd_normalize(simd_cross(plane.up, plane.normal))
        let shift = right * ((bx - 0.5) * span) + plane.up * ((0.5 - by) * span)
        liveLog(
            "DARTS_LIVE event=bull_refine red=\(cnt) shift_mm=\(Int(simd_length(shift) * 1000))"
        )
        guard simd_length(shift) < 0.04 else { return nil }
        var out = plane
        out.center += shift
        return out
    }

    /// N high-res stills (fallback: video frames) unwrapped with the tripod pose, averaged.
    private func captureAveragedSample(
        plane: BoardPlane,
        shots: Int = 3,
        completion: @escaping (PlaneDartDetector.Sample?) -> Void
    ) {
        let pose = tripodPose
        final class Acc { var samples: [PlaneDartDetector.Sample] = []; var hiRes = 0 }
        let acc = Acc()
        func next() {
            if acc.samples.count >= shots {
                liveLog("DARTS_LIVE event=avg_capture shots=\(acc.samples.count) hires=\(acc.hiRes)")
                completion(PlaneDartDetector.average(acc.samples))
                return
            }
            arView.session.captureHighResolutionFrame { [weak self] hiFrame, _ in
                DispatchQueue.main.async {
                    guard let self else { return }
                    guard let f = hiFrame ?? self.arView.session.currentFrame else {
                        completion(PlaneDartDetector.average(acc.samples))
                        return
                    }
                    if hiFrame != nil { acc.hiRes += 1 }
                    DispatchQueue.global(qos: .userInitiated).async {
                        let s = PlaneDartDetector.sample(frame: f, plane: plane, pose: pose)
                        DispatchQueue.main.async {
                            if let s { acc.samples.append(s) }
                            next()
                        }
                    }
                }
            }
        }
        next()
    }

    /// Documents/snaps/<ts>_empty.png + _snap.png — offline tuning and future training data.
    private func saveSnapPair(current: PlaneDartDetector.Sample) {
        guard let empty = planeDarts.emptySample else { return }
        let stamp = Int(Date().timeIntervalSince1970)
        DispatchQueue.global(qos: .utility).async {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let dir = docs.appendingPathComponent("snaps", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            if let e = BoardUnwrapRenderer.png(sample: empty) {
                try? e.write(to: dir.appendingPathComponent("\(stamp)_empty.png"))
            }
            if let s = BoardUnwrapRenderer.png(sample: current) {
                try? s.write(to: dir.appendingPathComponent("\(stamp)_snap.png"))
            }
        }
        liveLog("DARTS_LIVE event=snap_saved id=\(stamp)")
    }

    private func captureEmptyBoard() {
        guard let plane = boardPlane else { return }
        let pose = tripodPose ?? arView.session.currentFrame?.camera.transform
        captureAveragedSample(plane: plane) { [weak self] sample in
            guard let self, let sample, let pose else { return }
            self.planeDarts.setEmpty(sample, pose: pose)
            self.liveLog("DARTS_LIVE event=empty_ready src=plane")
        }
    }

    /// Lock exposure / WB / focus while scoring so empty vs snap differ only by darts.
    private func setCaptureLocked(_ locked: Bool) {
        guard let device = ARWorldTrackingConfiguration.configurableCaptureDeviceForPrimaryCamera
        else { return }
        do {
            try device.lockForConfiguration()
            if locked {
                if device.isExposureModeSupported(.locked) { device.exposureMode = .locked }
                if device.isWhiteBalanceModeSupported(.locked) { device.whiteBalanceMode = .locked }
                if device.isFocusModeSupported(.locked) { device.focusMode = .locked }
            } else {
                if device.isExposureModeSupported(.continuousAutoExposure) {
                    device.exposureMode = .continuousAutoExposure
                }
                if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
                    device.whiteBalanceMode = .continuousAutoWhiteBalance
                }
                if device.isFocusModeSupported(.continuousAutoFocus) {
                    device.focusMode = .continuousAutoFocus
                }
            }
            device.unlockForConfiguration()
            liveLog("DARTS_LIVE event=capture_lock \(locked ? 1 : 0)")
        } catch {
            liveLog("DARTS_LIVE event=capture_lock_fail \(error.localizedDescription)")
        }
    }

    /// Rectified-board diff → tips in board coords → metric plane score (misses included).
    private func scoreSnapOnPlane(frame: ARFrame, plane: BoardPlane) {
        _ = frame
        if !planeDarts.hasEmpty {
            captureEmptyBoard()
            throwPrompt = .throwNow
            statusText = "Снял пустую — бросай и жми ещё раз"
            liveLog("DARTS_LIVE event=snap captured_empty_late src=plane")
            return
        }
        captureAveragedSample(plane: plane) { [weak self] sample in
            guard let self else { return }
            guard let sample else {
                self.throwPrompt = .throwNow
                self.statusText = "Нет кадра — жми ещё раз"
                return
            }
            self.finishSnapOnPlane(sample: sample, plane: plane)
        }
    }

    private func finishSnapOnPlane(sample: PlaneDartDetector.Sample, plane: BoardPlane) {
        let darts = planeDarts.detect(current: sample, plane: plane)
        liveLog("DARTS_LIVE event=snap src=plane \(planeDarts.lastStats)")
        saveSnapPair(current: sample)

        var hits: [NativeThrowInput] = []
        for d in darts {
            let world = BoardHomography.worldFromBoardCoord(
                BoardHomography.Point2(x: d.boardX, y: d.boardY), plane: plane
            )
            guard let scored = BoardPlaneEstimator.scoreWorldPoint(world, plane: plane) else { continue }
            hits.append(scored)
            liveLog(
                "DARTS_LIVE SCORE SNAP \(label(scored)) src=planeDiff board=\(String(format: "%.3f,%.3f", d.boardX, d.boardY)) px=\(d.pixels)"
            )
        }

        if hits.isEmpty {
            throwPrompt = .throwNow
            statusText = "Не вижу дротики — бросай ещё"
            liveLog("DARTS_LIVE SCORE SNAP empty → retry src=plane")
            return
        }
        var labels: [String] = []
        for hit in hits {
            labels.append(label(hit))
            onDartScored?(hit)
        }
        if hits.count < 3 {
            for _ in hits.count..<3 {
                labels.append("МИМО")
                onDartScored?(NativeThrowInput(segment: .miss, multiplier: 1, confidence: 0.35))
            }
        }
        lastSnapshotLabels = labels
        throwPrompt = .pullDarts
        statusText = "Достаньте дротики"
        mlScorer.beginWaitingForClear()
        liveLog("DARTS_LIVE event=wait_removal prompt=pullDarts labels=\(labels.joined(separator: ",")) src=plane")
    }

    /// User confirms board is empty after pulling darts.
    func userConfirmedClear() {
        guard isScoring, throwPrompt == .pullDarts else { return }
        mlScorer.reset()
        scorer.reset()
        relockHomography()
        throwPrompt = .throwNow
        lastSnapshotLabels = []
        statusText = "Бросай"
        if let frame = arView.session.currentFrame, let calib = boardImageCalib {
            rgbSnap.captureVisitEmpty(frame: frame, calib: calib)
        }
        captureEmptyBoard()
        liveLog("DARTS_LIVE event=user_clear → throwNow empty=\(rgbSnap.hasEmptyReference ? 1 : 0) H=\(mlScorer.isCalibLocked ? 1 : 0)")
        onBoardCleared?()
    }

    /// Visit finished (3 darts / checkout) — stop scoring until darts are pulled.
    /// True while visit is done and we wait for an empty board.
    var scorerWaitingForClear: Bool {
        usesMlScorer ? mlScorer.isWaitingForClear : scorer.isWaitingForClear
    }

    func waitForRemoval() {
        guard isScoring else { return }
        if usesMlScorer {
            mlScorer.beginWaitingForClear()
        } else {
            scorer.beginWaitingForClear()
        }
        throwPrompt = .pullDarts
        statusText = "Достаньте дротики"
        liveLog("DARTS_LIVE event=wait_removal")
    }

    /// Undo / cancel handoff — resume listening for throws.
    func resumeListening() {
        guard isScoring else { return }
        if usesMlScorer {
            mlScorer.cancelWaitingForClear()
        } else {
            scorer.cancelWaitingForClear()
        }
        throwPrompt = .throwNow
        statusText = "Бросай"
        liveLog("DARTS_LIVE event=resume_listening prompt=throwNow")
    }

    func stop() {
        arView.session.pause()
        isRunning = false
        isScoring = false
        bullLocked = false
        tripodReady = false
        autoLockStreak = 0
        boardPlane = nil
        boardImageCalib = nil
        scorer.reset()
        mlScorer.reset()
        coaching?.removeFromSuperview()
        coaching = nil
        statusText = ""
    }

    private func distanceToBoard(frame: ARFrame, plane: BoardPlane) -> Float? {
        let t = frame.camera.transform.columns.3
        let cam = SIMD3<Float>(t.x, t.y, t.z)
        return simd_length(cam - plane.center)
    }

    /// Raycast tap → board plane on a vertical wall only.
    @discardableResult
    func confirmBoard(at viewPoint: CGPoint) -> BoardPlane? {
        // Never fall back to `.any` — that snaps to floors/tables.
        let attempts: [ARRaycastQuery.Target] = [
            .existingPlaneGeometry,
            .estimatedPlane,
        ]
        var hit: ARRaycastResult?
        for target in attempts {
            let results = arView.raycast(
                from: viewPoint,
                allowing: target,
                alignment: .vertical
            )
            if let first = results.first {
                hit = first
                break
            }
        }
        guard let first = hit else {
            statusText = "Нужна вертикальная стена — встаньте напротив мишени"
            return nil
        }

        let transform = first.worldTransform
        let center = SIMD3<Float>(
            transform.columns.3.x,
            transform.columns.3.y,
            transform.columns.3.z
        )
        // ARRaycastResult: for plane hits, the Y axis is the surface normal.
        var normal = simd_normalize(
            SIMD3<Float>(transform.columns.1.x, transform.columns.1.y, transform.columns.1.z)
        )
        // Must be a wall (normal mostly horizontal). Reject floor/ceiling hits.
        if abs(simd_dot(normal, SIMD3<Float>(0, 1, 0))) > 0.35 {
            statusText = "Нужна вертикальная стена — встаньте напротив мишени"
            return nil
        }

        let camPos: SIMD3<Float>? = arView.session.currentFrame.map {
            SIMD3<Float>(
                $0.camera.transform.columns.3.x,
                $0.camera.transform.columns.3.y,
                $0.camera.transform.columns.3.z
            )
        }
        if let cam = camPos, simd_dot(normal, simd_normalize(cam - center)) < 0 {
            normal = -normal
        }

        let plane = BoardPlaneEstimator.makePlane(
            center: center,
            planeNormal: normal,
            cameraPosition: camPos
        )
        boardPlane = plane
        // Do NOT clear boardImageCalib — RGB circle is source of truth for scoring.
        bullLocked = true
        if !usesMlScorer {
            placeGuide(at: plane)
        } else {
            arView.scene.anchors.removeAll()
        }
        liveLog("DARTS_LIVE event=plane_locked")
        return plane
    }

    /// Fully automatic from tripod: LiDAR wall + board center (BoardDisk/RGB) → metric plane.
    private func tryAutoCalibrate(frame: ARFrame) {
        guard isRunning, !isScoring, !tripodReady else { return }
        tryLidarBoardCalibrate(frame: frame)
    }

    /// LiDAR wall normal + depth bull (BoardDisk / RGB) → BoardPlane r=170mm → image overlay.
    private func tryLidarBoardCalibrate(frame: ARFrame) {
        let t = frame.timestamp
        guard t - lastBullAutoAt > 0.20 else { return }
        lastBullAutoAt = t
        if calibStartedAt == 0 { calibStartedAt = t }

        // 0) LiDAR-only: board = disk ~4 cm proud of the wall. Plane + center + 20 by gravity.
        if tryDepthBoardCalibrate(frame: frame) { return }
        if t - calibStartedAt < 5 {
            statusText = "LiDAR · ищу мишень по глубине…"
            return
        }

        // 1) Board center — BoardDisk only when model is present.
        // RGB/red bull fallback falsely locks onto red wall signs ("MAINTENANCE").
        var bullX: Float = 0
        var bullY: Float = 0
        var seedR: Float = 0
        var seedSrc = "none"
        if boardDisk.isModelLoaded {
            guard let det = boardDisk.detect(frame: frame), det.conf >= 0.45 else {
                statusText = "LiDAR · мишень (ML)…"
                if Int(t * 2) % 5 == 0 {
                    liveLog(
                        "DARTS_LIVE event=lidar_calib miss board=\(boardDisk.statusLine)"
                    )
                }
                return
            }
            bullX = det.imageX
            bullY = det.imageY
            seedR = det.radiusPx
            seedSrc = "boardDisk"
        } else if let hit = BullDetector.findBull(
            frame: frame,
            viewSize: arView.bounds.size,
            orientation: interfaceOrientation
        ), hit.source != "red" {
            // Face/cork only — never solid red banners.
            bullX = hit.imageX
            bullY = hit.imageY
            seedR = hit.estimatedBoardRadiusPx
            seedSrc = hit.source
        } else {
            statusText = "LiDAR · ищем мишень…"
            if Int(t * 2) % 5 == 0 {
                liveLog(
                    "DARTS_LIVE event=lidar_calib miss board=\(boardDisk.statusLine) why=\(BullDetector.lastReject)"
                )
            }
            return
        }

        if let last = lockSamples.last {
            let jump = hypot(bullX - last.x, bullY - last.y)
            if jump > max(28, last.r * 0.22) {
                lockSamples = []
                autoLockStreak = 0
                liveLog("DARTS_LIVE event=board_jump px=\(Int(jump)) → reset")
            }
        }
        lockSamples.append((bullX, bullY, max(seedR, 1)))
        if lockSamples.count > 8 { lockSamples.removeFirst(lockSamples.count - 8) }
        autoLockStreak += 1
        liveLog(
            "DARTS_LIVE event=auto_lock streak=\(autoLockStreak) src=\(seedSrc)+lidar bull=\(Int(bullX)),\(Int(bullY)) rPx=\(Int(seedR))"
        )
        let needSamples = 3
        guard autoLockStreak >= needSamples, lockSamples.count >= needSamples else {
            statusText = "LiDAR \(autoLockStreak)/\(needSamples)…"
            return
        }
        let xs = lockSamples.map(\.x).sorted()
        let ys = lockSamples.map(\.y).sorted()
        let mid = lockSamples.count / 2
        let medX = xs[mid], medY = ys[mid]
        let spread = hypot(xs.last! - xs.first!, ys.last! - ys.first!)
        if spread > 48 {
            liveLog("DARTS_LIVE event=calib_reject spread=\(Int(spread))")
            lockSamples = []
            autoLockStreak = 0
            return
        }

        // 2) Wall from depth cloud around board (instant). ARPlane / facing fallback.
        let camPos = SIMD3<Float>(
            frame.camera.transform.columns.3.x,
            frame.camera.transform.columns.3.y,
            frame.camera.transform.columns.3.z
        )
        let seedRMed = lockSamples.map(\.r).sorted()[mid]
        var wallSrc = "depthFit"
        var wall = BoardPlaneEstimator.wallFromDepthAroundBoard(
            bullX: medX,
            bullY: medY,
            radiusPx: seedRMed,
            frame: frame,
            orientation: interfaceOrientation
        )
        if wall == nil {
            wall = BoardPlaneEstimator.bestVerticalWall(frame: frame)
            wallSrc = "arPlane"
        }
        if wall == nil,
           let w = BoardPlaneEstimator.worldFromImagePixel(
               imageX: medX,
               imageY: medY,
               frame: frame,
               orientation: interfaceOrientation
           ) {
            wall = BoardPlaneEstimator.facingPlaneThroughPoint(w, camera: frame.camera)
            wallSrc = "facingDepth"
        }
        guard let wall else {
            statusText = "LiDAR · нет depth / стены"
            liveLog("DARTS_LIVE event=lidar_calib wait_wall depth=0 anchors=\(frame.anchors.count)")
            return
        }
        liveLog("DARTS_LIVE event=wall_ok src=\(wallSrc)")

        // 3) Bull in world: depth unproject, else ray ∩ wall.
        let bullWorld: SIMD3<Float>
        if let w = BoardPlaneEstimator.worldFromImagePixel(
            imageX: medX,
            imageY: medY,
            frame: frame,
            orientation: interfaceOrientation
        ) {
            bullWorld = BoardPlaneEstimator.projectOntoPlane(
                w, origin: wall.origin, normal: wall.normal
            )
        } else {
            let ray = BoardPlaneEstimator.rayFromImagePixel(
                imageX: medX, imageY: medY, camera: frame.camera
            )
            let denom = simd_dot(ray.direction, wall.normal)
            guard abs(denom) > 1e-5 else {
                liveLog("DARTS_LIVE event=lidar_calib reject=ray_parallel")
                return
            }
            let tt = simd_dot(wall.origin - ray.origin, wall.normal) / denom
            guard tt > 0.3, tt < 5 else {
                liveLog("DARTS_LIVE event=lidar_calib reject=ray_t=\(String(format: "%.2f", tt))")
                return
            }
            bullWorld = ray.origin + tt * ray.direction
        }

        let plane = BoardPlaneEstimator.makePlane(
            center: bullWorld,
            planeNormal: wall.normal,
            cameraPosition: camPos
        )
        boardPlane = plane

        // 4) Overlay from metric plane (angle-correct). Fallback seedR if project fails.
        let hit = BullDetector.Hit(
            viewPoint: .zero,
            imageX: medX,
            imageY: medY,
            redPixels: 0,
            estimatedBoardRadiusPx: seedR > 20 ? seedR : 200,
            source: "lidar+\(seedSrc)"
        )
        guard commitCalibFromBull(hit: hit, frame: frame, markReady: false),
              let img = boardImageCalib
        else { return }

        let hOk = mlScorer.lockFromPlane(plane, camera: frame.camera)
            || mlScorer.lockFromImageCircle(img)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        statusText = hOk ? "H · кидай" : "LiDAR · кидай"
        liveLog(
            "DARTS_LIVE event=auto_calib_done src=lidar+\(wallSrc)+\(seedSrc) H=\(hOk ? 1 : 0) status=\(mlScorer.statusLine) rPx=\(Int(img.radiusPx)) bull=\(Int(img.cx)),\(Int(img.cy)) dist=\(String(format: "%.2f", simd_length(camPos - plane.center)))"
        )
        tripodReady = true
        lockSamples = []
        autoLockStreak = 0
        if !isScoring {
            startScoring()
            onReadyForScoring?()
        }
    }

    /// Board from LiDAR relief → metric plane → H. Needs 3 agreeing frames.
    private func tryDepthBoardCalibrate(frame: ARFrame) -> Bool {
        guard let det = BoardDepthDetector.detect(frame: frame) else {
            depthBoardSamples = []
            if Int(frame.timestamp * 2) % 4 == 0 {
                liveLog("DARTS_LIVE event=depth_board miss why=\(BoardDepthDetector.lastReject)")
            }
            return false
        }
        if let last = depthBoardSamples.last, simd_length(last.center - det.center) > 0.03 {
            depthBoardSamples = []
        }
        depthBoardSamples.append(det)
        if depthBoardSamples.count > 5 { depthBoardSamples.removeFirst() }
        liveLog(
            "DARTS_LIVE event=depth_board n=\(depthBoardSamples.count) cells=\(det.cells) d=\(String(format: "%.3f", det.diameter)) off=\(String(format: "%.3f", det.faceOffset))"
        )
        guard depthBoardSamples.count >= 3 else {
            statusText = "LiDAR · мишень \(depthBoardSamples.count)/3"
            return true
        }

        let k = Float(depthBoardSamples.count)
        let center = depthBoardSamples.map(\.center).reduce(SIMD3<Float>(0, 0, 0), +) / k
        let normal = simd_normalize(depthBoardSamples.map(\.normal).reduce(SIMD3<Float>(0, 0, 0), +))
        let camPos = SIMD3<Float>(
            frame.camera.transform.columns.3.x,
            frame.camera.transform.columns.3.y,
            frame.camera.transform.columns.3.z
        )
        var plane = BoardPlaneEstimator.makePlane(
            center: center,
            planeNormal: normal,
            cameraPosition: camPos
        )
        for _ in 0..<2 {
            guard let refined = refineCenterOnBull(frame: frame, plane: plane) else { break }
            plane = refined
        }
        boardPlane = plane

        guard let proj = BoardImageCalibration.project(world: plane.center, camera: frame.camera) else {
            liveLog("DARTS_LIVE event=depth_board reject=project")
            boardPlane = nil
            return true
        }
        let hit = BullDetector.Hit(
            viewPoint: .zero,
            imageX: proj.x,
            imageY: proj.y,
            redPixels: 0,
            estimatedBoardRadiusPx: 200,
            source: "lidarDepth"
        )
        guard commitCalibFromBull(hit: hit, frame: frame, markReady: false),
              let img = boardImageCalib
        else {
            boardPlane = nil
            depthBoardSamples = []
            return true
        }

        let hOk = mlScorer.lockFromPlane(plane, camera: frame.camera)
            || mlScorer.lockFromImageCircle(img)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        statusText = hOk ? "LiDAR · кидай" : "LiDAR · кидай (без H)"
        liveLog(
            "DARTS_LIVE event=auto_calib_done src=lidarDepth H=\(hOk ? 1 : 0) rPx=\(Int(img.radiusPx)) bull=\(Int(img.cx)),\(Int(img.cy)) dist=\(String(format: "%.2f", simd_length(camPos - plane.center))) n=\(String(format: "%.2f,%.2f,%.2f", normal.x, normal.y, normal.z))"
        )
        tripodReady = true
        depthBoardSamples = []
        lockSamples = []
        autoLockStreak = 0
        if !isScoring {
            startScoring()
            onReadyForScoring?()
        }
        return true
    }

    /// RGB dark-face / red surround → circle H (interim without BoardDisk.mlpackage).
    private func tryBullCalibrateMlFallback(frame: ARFrame) {
        let size = arView.bounds.size
        guard size.width > 8, size.height > 8 else { return }

        guard let hit = BullDetector.findBull(
            frame: frame,
            viewSize: size,
            orientation: interfaceOrientation
        ) else {
            autoLockStreak = max(0, autoLockStreak - 1)
            if autoLockStreak == 0 { lockSamples = [] }
            if Int(frame.timestamp * 2) % 5 == 0 {
                let why = BullDetector.lastReject.isEmpty ? "-" : BullDetector.lastReject
                liveLog(
                    "DARTS_LIVE event=bull_search miss red=\(BullDetector.lastRedCount) face=\(BullDetector.lastSurroundPx) why=\(why) board=\(boardDisk.statusLine)"
                )
            }
            return
        }

        if let last = lockSamples.last {
            let jump = hypot(hit.imageX - last.x, hit.imageY - last.y)
            if jump > max(28, last.r * 0.22) {
                lockSamples = []
                autoLockStreak = 0
                liveLog("DARTS_LIVE event=bull_jump px=\(Int(jump)) → reset")
            }
        }

        lockSamples.append((hit.imageX, hit.imageY, hit.estimatedBoardRadiusPx))
        if lockSamples.count > 8 { lockSamples.removeFirst(lockSamples.count - 8) }
        autoLockStreak += 1
        liveLog(
            "DARTS_LIVE event=auto_lock streak=\(autoLockStreak) src=\(hit.source) red=\(hit.redPixels) face=\(BullDetector.lastSurroundPx) bull=\(Int(hit.imageX)),\(Int(hit.imageY)) rPx=\(Int(hit.estimatedBoardRadiusPx))"
        )

        let needSamples = 4
        guard autoLockStreak >= needSamples, lockSamples.count >= needSamples else {
            statusText = "Мишень \(autoLockStreak)/\(needSamples)…"
            return
        }

        let xs = lockSamples.map(\.x).sorted()
        let ys = lockSamples.map(\.y).sorted()
        let rs = lockSamples.map(\.r).sorted()
        let mid = lockSamples.count / 2
        let medX = xs[mid], medY = ys[mid], medR = rs[mid]
        let spread = hypot(xs.last! - xs.first!, ys.last! - ys.first!)
        if spread > max(48, medR * 0.40) {
            liveLog("DARTS_LIVE event=calib_reject spread=\(Int(spread))")
            lockSamples = []
            autoLockStreak = 0
            return
        }

        let fakeHit = BullDetector.Hit(
            viewPoint: .zero,
            imageX: medX,
            imageY: medY,
            redPixels: hit.redPixels,
            estimatedBoardRadiusPx: medR,
            source: hit.source
        )
        guard commitCalibFromBull(hit: fakeHit, frame: frame, markReady: false),
              let img = boardImageCalib,
              mlScorer.lockFromImageCircle(img)
        else { return }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        statusText = "ML · кидай (\(hit.source))"
        liveLog(
            "DARTS_LIVE event=auto_calib_done src=\(hit.source)+circleH rPx=\(Int(img.radiusPx)) bull=\(Int(img.cx)),\(Int(img.cy)) ml=1"
        )
        tripodReady = true
        lockSamples = []
        autoLockStreak = 0
        if !isScoring {
            startScoring()
            onReadyForScoring?()
        }
    }

    /// RGB-only fallback: hollow surround ring → median lock → start.
    private func tryBullCalibrate(frame: ARFrame) {
        let t = frame.timestamp
        guard t - lastBullAutoAt > 0.22 else { return }
        lastBullAutoAt = t

        let size = arView.bounds.size
        guard size.width > 8, size.height > 8 else { return }

        guard let hit = BullDetector.findBull(
            frame: frame,
            viewSize: size,
            orientation: interfaceOrientation
        ) else {
            autoLockStreak = max(0, autoLockStreak - 1)
            if autoLockStreak == 0 { lockSamples = [] }
            statusText = "Ищем красный обод…"
            if Int(t * 2) % 4 == 0 {
                let why = BullDetector.lastReject.isEmpty ? "-" : BullDetector.lastReject
                liveLog(
                    "DARTS_LIVE event=bull_search miss red=\(BullDetector.lastRedCount) surround=\(BullDetector.lastSurroundPx) why=\(why)"
                )
            }
            return
        }

        // Jump vs last sample (not vs committed calib — we only commit at the end).
        if let last = lockSamples.last {
            let jump = hypot(hit.imageX - last.x, hit.imageY - last.y)
            if jump > max(35, hit.estimatedBoardRadiusPx * 0.12) {
                autoLockStreak = 0
                lockSamples = []
                liveLog("DARTS_LIVE event=bull_jump px=\(Int(jump)) → reset")
                return
            }
        }

        lockSamples.append((hit.imageX, hit.imageY, hit.estimatedBoardRadiusPx))
        if lockSamples.count > autoLockNeeded {
            lockSamples.removeFirst()
        }
        autoLockStreak = lockSamples.count

        // Preview overlay from latest hit (visual only).
        _ = commitCalibFromBull(hit: hit, frame: frame, markReady: false)
        _ = confirmBoard(at: hit.viewPoint)

        statusText = "Калибровка \(autoLockStreak)/\(autoLockNeeded)…"
        liveLog(
            "DARTS_LIVE event=auto_lock streak=\(autoLockStreak) red=\(hit.redPixels) surround=\(BullDetector.lastSurroundPx) bull=\(Int(hit.imageX)),\(Int(hit.imageY)) rPx=\(Int(hit.estimatedBoardRadiusPx))"
        )

        guard autoLockStreak >= autoLockNeeded else { return }

        // Median lock — kills one-frame wander.
        let xs = lockSamples.map(\.x).sorted()
        let ys = lockSamples.map(\.y).sorted()
        let rs = lockSamples.map(\.r).sorted()
        let mid = lockSamples.count / 2
        let medX = xs[mid]
        let medY = ys[mid]
        let medR = rs[mid]
        let spread = hypot(xs.last! - xs.first!, ys.last! - ys.first!)
        guard spread < max(50, medR * 0.14) else {
            liveLog("DARTS_LIVE event=calib_reject spread=\(Int(spread))")
            autoLockStreak = 0
            lockSamples = []
            return
        }

        var medianHit = hit
        medianHit.imageX = medX
        medianHit.imageY = medY
        medianHit.estimatedBoardRadiusPx = medR
        guard commitCalibFromBull(hit: medianHit, frame: frame, markReady: false) else {
            autoLockStreak = 0
            lockSamples = []
            return
        }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        statusText = usesMlScorer ? "ML · кидай" : "Готово · кидай"
        liveLog(
            "DARTS_LIVE event=auto_calib_done rPx=\(Int(medR)) bull=\(Int(medX)),\(Int(medY)) spread=\(Int(spread)) ml=\(usesMlScorer ? 1 : 0)"
        )
        tripodReady = true
        lockSamples = []
        if usesMlScorer, !isScoring {
            startScoring()
            onReadyForScoring?()
        }
    }

    private func translucent(_ color: UIColor, opacity: Float) -> UnlitMaterial {
        var mat = UnlitMaterial()
        // RealityKit ignores UIColor alpha unless blending is transparent.
        mat.color = .init(tint: color.withAlphaComponent(1), texture: nil)
        mat.blending = .transparent(opacity: .init(floatLiteral: opacity))
        return mat
    }

    private func placeGuide(at plane: BoardPlane) {
        arView.scene.anchors.removeAll()

        let n = simd_normalize(plane.normal)
        var up = simd_normalize(plane.up)
        var right = simd_cross(up, n)
        if simd_length(right) < 1e-4 {
            right = simd_cross(SIMD3<Float>(0, 0, 1), n)
        }
        right = simd_normalize(right)
        up = simd_normalize(simd_cross(n, right))

        // Local: X = right, Y = up (20), Z = out of board.
        var matrix = matrix_identity_float4x4
        matrix.columns.0 = SIMD4<Float>(right.x, right.y, right.z, 0)
        matrix.columns.1 = SIMD4<Float>(up.x, up.y, up.z, 0)
        matrix.columns.2 = SIMD4<Float>(n.x, n.y, n.z, 0)
        matrix.columns.3 = SIMD4<Float>(plane.center.x, plane.center.y, plane.center.z, 1)

        let anchor = AnchorEntity(world: .zero)
        anchor.transform.matrix = matrix

        let diameter = plane.radius * 2
        // Very light wash — board remains readable underneath.
        let disk = ModelEntity(
            mesh: MeshResource.generateBox(size: [diameter, diameter, 0.002]),
            materials: [translucent(UIColor(red: 1, green: 0.84, blue: 0.04, alpha: 1), opacity: 0.10)]
        )
        disk.position = SIMD3<Float>(0, 0, 0.001)
        anchor.addChild(disk)

        let edge: Float = 0.007
        let half = plane.radius
        let rimMat = translucent(UIColor(red: 1, green: 0.9, blue: 0.15, alpha: 1), opacity: 0.55)
        let rimSpecs: [(SIMD3<Float>, SIMD3<Float>)] = [
            (SIMD3(0, half, 0.004), SIMD3(diameter, edge, edge)),
            (SIMD3(0, -half, 0.004), SIMD3(diameter, edge, edge)),
            (SIMD3(half, 0, 0.004), SIMD3(edge, diameter, edge)),
            (SIMD3(-half, 0, 0.004), SIMD3(edge, diameter, edge)),
        ]
        for (pos, size) in rimSpecs {
            let rim = ModelEntity(mesh: MeshResource.generateBox(size: size), materials: [rimMat])
            rim.position = pos
            anchor.addChild(rim)
        }

        let tick = ModelEntity(
            mesh: MeshResource.generateBox(size: [0.014, 0.055, 0.008]),
            materials: [translucent(UIColor.systemYellow, opacity: 0.7)]
        )
        tick.position = SIMD3<Float>(0, plane.radius * 0.88, 0.006)
        anchor.addChild(tick)

        let bull = ModelEntity(
            mesh: MeshResource.generateSphere(radius: 0.012),
            materials: [translucent(UIColor(red: 1, green: 0.25, blue: 0.2, alpha: 1), opacity: 0.65)]
        )
        bull.position = SIMD3<Float>(0, 0, 0.008)
        anchor.addChild(bull)

        arView.scene.addAnchor(anchor)
    }

    private func installCoaching() {
        coaching?.removeFromSuperview()
        let overlay = ARCoachingOverlayView()
        overlay.session = arView.session
        overlay.goal = .verticalPlane
        overlay.activatesAutomatically = true
        // Must not steal taps — otherwise «тап по буллу» never reaches ARView.
        overlay.isUserInteractionEnabled = false
        overlay.translatesAutoresizingMaskIntoConstraints = false
        arView.addSubview(overlay)
        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: arView.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: arView.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: arView.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: arView.bottomAnchor),
        ])
        coaching = overlay
    }

    private var interfaceOrientation: UIInterfaceOrientation {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first
        return scene?.interfaceOrientation ?? .portrait
    }

    /// USB console + Documents file + web bridge (filter: DARTS_LIVE).
    private func liveLog(_ line: String) {
        os_log("%{public}@", log: Self.log, type: .info, line)
        LiveTelemetry.log(line)
    }

    /// Push live board unwrap (or circle crop) into the LAN MJPEG stream.
    private func publishVisionFrame(_ frame: ARFrame) {
        let t = frame.timestamp
        guard t - lastVisionAt >= visionInterval, !visionBusy else { return }
        lastVisionAt = t
        visionBusy = true

        let H = mlScorer.homography
        let cropO = mlScorer.cropOrigin
        let cropS = mlScorer.cropSide
        let calib = boardImageCalib
        let tipsImg = mlScorer.committedTipsImage
        let tipLast = mlScorer.lastTipImage
        let plane = boardPlane
        let planePose = tripodPose
        let planeMask = planeDarts.lastMask
        let planeShadow = planeDarts.lastShadow
        let planeTips = planeDarts.lastDarts.map {
            BoardUnwrapRenderer.TipMark(boardX: $0.boardX, boardY: $0.boardY, label: nil)
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            defer {
                Task { @MainActor in self?.visionBusy = false }
            }
            if let plane,
               let jpeg = BoardUnwrapRenderer.jpegPlane(
                   frame: frame, plane: plane, pose: planePose,
                   mask: planeMask, shadow: planeShadow, tips: planeTips
               ) {
                EmbeddedWebServer.shared.updateVisionJPEG(jpeg)
                return
            }
            var marks: [BoardUnwrapRenderer.TipMark] = []
            if let H, cropS > 1 {
                for tip in tipsImg {
                    let nx = (tip.x - cropO.x) / cropS
                    let ny = (tip.y - cropO.y) / cropS
                    let bp = BoardHomography.apply(H, BoardHomography.Point2(x: nx, y: ny))
                    marks.append(.init(boardX: bp.x, boardY: bp.y, label: nil))
                }
                if tipLast.x > 0, !tipsImg.contains(where: {
                    hypot($0.x - tipLast.x, $0.y - tipLast.y) < 8
                }) {
                    let nx = (tipLast.x - cropO.x) / cropS
                    let ny = (tipLast.y - cropO.y) / cropS
                    let bp = BoardHomography.apply(H, BoardHomography.Point2(x: nx, y: ny))
                    marks.append(.init(boardX: bp.x, boardY: bp.y, label: nil))
                }
            }

            // Prefer camera crop of the locked circle — honest "what we locked".
            // H unwrap only when board-bull projects near image calib (else shows wall).
            let jpeg: Data?
            if let calib {
                var useH = false
                if let H, cropS > 1, let Hinv = BoardHomography.invert(H) {
                    let bull = BoardHomography.apply(
                        Hinv,
                        BoardHomography.Point2(x: 0.5, y: 0.5)
                    )
                    let ix = cropO.x + bull.x * cropS
                    let iy = cropO.y + bull.y * cropS
                    let d = hypot(ix - calib.cx, iy - calib.cy)
                    useH = d < max(36, calib.radiusPx * 0.35)
                }
                if useH, let H {
                    jpeg = BoardUnwrapRenderer.jpeg(
                        frame: frame,
                        H: H,
                        cropOrigin: cropO,
                        cropSide: cropS,
                        tips: marks,
                        size: 320
                    )
                } else {
                    // Wider crop so a wrong lock is obvious in the browser.
                    let wide = BoardImageCalibration(
                        cx: calib.cx,
                        cy: calib.cy,
                        radiusPx: calib.radiusPx * 1.2,
                        upX: calib.upX,
                        upY: calib.upY,
                        imageWidth: calib.imageWidth,
                        imageHeight: calib.imageHeight
                    )
                    jpeg = BoardUnwrapRenderer.jpegFromCircle(
                        frame: frame, calib: wide, size: 360
                    )
                }
            } else {
                jpeg = nil
            }
            guard let jpeg else { return }
            EmbeddedWebServer.shared.updateVisionJPEG(jpeg)
        }
    }
}

extension LidarSession: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        Task { @MainActor in
            let t = frame.timestamp

            // Live vision MJPEG for club TV (unwrap when H locked).
            if isRunning || isScoring {
                publishVisionFrame(frame)
            }

            // Heartbeat + fully automatic board lock from tripod.
            if !isScoring {
                if isRunning {
                    tryAutoCalibrate(frame: frame)
                }
                if t - lastDebugLog > 1.0 {
                    lastDebugLog = t
                    let mode = isRunning ? "preview" : "idle"
                    let planeLocked = boardPlane != nil ? 1 : 0
                    liveLog("DARTS_LIVE mode=\(mode) plane=\(planeLocked) ready=\(tripodReady ? 1 : 0) scoring=0")
                }
                return
            }

            guard !isAnalyzingFrame else { return }
            isAnalyzingFrame = true
            defer { isAnalyzingFrame = false }

            // Manual gate: only auto-run while waiting for darts to be pulled
            // (board-cleared). Scoring itself is «Бросил» snapshot.
            if throwPrompt == .throwNow || throwPrompt == .scoring {
                if t - lastDebugLog > 1.0 {
                    lastDebugLog = t
                    liveLog(
                        "DARTS_LIVE mode=scoring prompt=\(throwPrompt == .throwNow ? "throwNow" : "scoring") status=\(statusText) board=\(boardDisk.statusLine)"
                    )
                }
                return
            }

            let outcome: DartScorerOutcome
            let diag: DartScorerDiagnostics
            if usesMlScorer {
                guard let imgCalib = boardImageCalib else {
                    if t - lastDebugLog > 0.5 {
                        lastDebugLog = t
                        liveLog("DARTS_LIVE mode=scoring reject=no_bull_calib")
                    }
                    return
                }
                outcome = mlScorer.analyze(frame: frame, imageCalib: imgCalib)
                diag = mlScorer.lastDiagnostics
            } else {
                guard let imgCalib = boardImageCalib else {
                    if t - lastDebugLog > 1.0 {
                        lastDebugLog = t
                        liveLog("DARTS_LIVE mode=scoring calib=0 reject=no_calib")
                    }
                    return
                }
                let plane = boardPlane ?? BoardPlane(
                    center: .zero,
                    normal: SIMD3<Float>(0, 0, 1),
                    radius: BoardPlaneEstimator.standardRadius,
                    up: SIMD3<Float>(0, 1, 0)
                )
                outcome = scorer.analyze(
                    frame: frame,
                    plane: plane,
                    imageCalib: imgCalib,
                    orientation: interfaceOrientation
                )
                diag = scorer.lastDiagnostics
                _ = imgCalib
            }

            let isEvent: Bool = {
                if case .none = outcome { return false }
                return true
            }()
            if t - lastDebugLog > 0.25 || isEvent {
                lastDebugLog = t
                let line = String(
                    format: "DARTS_LIVE phase=%@ ready=%d darts=%d empty=%d rgbPx=%d stab=%d reject=%@ src=%@ status=%@",
                    diag.phase,
                    diag.ready ? 1 : 0,
                    diag.dartsInVisit,
                    diag.emptyCaptured ? 1 : 0,
                    diag.rgbPixels,
                    diag.stableFrames,
                    diag.rejectReason.isEmpty ? "-" : diag.rejectReason,
                    diag.source.isEmpty ? "-" : diag.source,
                    usesMlScorer ? mlScorer.statusLine : "-"
                )
                liveLog(line)
            }
            switch outcome {
            case .scored(let hit):
                let n = diag.dartsInVisit
                let src = usesMlScorer ? "ml" : "rgb"
                statusText = "\(label(hit)) · \(n)/3 · \(src)"
                if usesMlScorer {
                    let t = mlScorer.lastTipImage
                    let c = boardImageCalib
                    liveLog(
                        "DARTS_LIVE SCORE \(label(hit)) src=\(src) darts=\(n)/3 tip=\(Int(t.x)),\(Int(t.y)) dist=\(String(format: "%.2f", mlScorer.lastTipBoardDist)) rPx=\(Int(c?.radiusPx ?? 0)) bull=\(Int(c?.cx ?? 0)),\(Int(c?.cy ?? 0))"
                    )
                } else {
                    liveLog("DARTS_LIVE SCORE \(label(hit)) src=\(src) darts=\(n)/3")
                }
                onDartScored?(hit)
                if scorerWaitingForClear {
                    statusText = "Достаньте дротики · \(n)/3"
                    liveLog("DARTS_LIVE event=wait_removal darts=\(n)")
                }
            case .boardCleared:
                throwPrompt = .throwNow
                lastSnapshotLabels = []
                statusText = "Бросай"
                liveLog("DARTS_LIVE BOARD_CLEARED → throwNow")
                onBoardCleared?()
            case .none:
                if t - lastStatusRefresh > 0.4 {
                    lastStatusRefresh = t
                    if diag.waitingClear || throwPrompt == .pullDarts {
                        statusText = "Достаньте дротики"
                        throwPrompt = .pullDarts
                    }
                }
            }
        }
    }

    private func label(_ input: NativeThrowInput) -> String {
        switch input.segment {
        case .miss: return "МИМО"
        case .bull25: return "B25"
        case .bull50: return "B50"
        case .number(let n):
            if input.multiplier == 3 { return "T\(n)" }
            if input.multiplier == 2 { return "D\(n)" }
            return "\(n)"
        }
    }
}
