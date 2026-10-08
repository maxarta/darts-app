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

    let arView = ARView(frame: .zero)
    var boardPlane: BoardPlane?
    /// 2D board circle in camera image — RGB scores against this.
    var boardImageCalib: BoardImageCalibration?
    private var lastBullAutoAt: TimeInterval = 0
    private var autoLockStreak = 0
    private let autoLockNeeded = 6
    /// Accumulate hits; commit median only when streak completes (stops wander-lock).
    private var lockSamples: [(x: Float, y: Float, r: Float)] = []
    var onDartScored: ((NativeThrowInput) -> Void)?
    var onBoardCleared: (() -> Void)?
    /// Fired once board geometry is locked and scoring can begin (ML hybrid / RGB).
    var onReadyForScoring: (() -> Void)?

    private let scorer = DartScorer()
    private let mlScorer = TipKeypointScorer()
    /// Prefer Core ML tip detection when the model is bundled.
    var usesMlScorer: Bool { mlScorer.isModelLoaded }
    private var coaching: ARCoachingOverlayView?
    private var boardTapRecognizer: UITapGestureRecognizer?
    private var isAnalyzingFrame = false
    private var lastStatusRefresh: TimeInterval = 0
    private var lastDebugLog: TimeInterval = 0
    private static let log = OSLog(subsystem: "app.artdart.score", category: "autoscore")

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
        liveLog("DARTS_LIVE mode=preview plane=0 scoring=0 event=start_preview")
        boardPlane = nil
        boardImageCalib = nil
        lastBullAutoAt = 0
        scorer.reset()
        mlScorer.reset()
        statusText = usesMlScorer ? "ML · ищем обод…" : "Ищем мишень…"
        installCoaching()
        // ML still needs board geometry first (bull circle). Tips come from Core ML after.
    }

    /// Prefer RGB bull circle; plane projection is optional (guide only).
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

        // ML hybrid: always RGB bull circle. AR plane projection skews center/radius
        // and pushes real tips outside the scoring disc (telemetry: out=2).
        if !usesMlScorer,
           let plane = boardPlane,
           let fromPlane = BoardImageCalibration.from(plane: plane, camera: frame.camera),
           fromPlane.radiusPx > 28 {
            img = fromPlane
            liveLog("DARTS_LIVE event=calib_src=plane rPx=\(Int(fromPlane.radiusPx))")
        } else {
            liveLog(
                "DARTS_LIVE event=calib_src=rgb rPx=\(Int(hit.estimatedBoardRadiusPx)) red=\(hit.redPixels) bull=\(Int(hit.imageX)),\(Int(hit.imageY))"
            )
        }

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
        // ML scores in RGB image space — 3D plane guide often drifts off the board.
        // Show 2D ring from bull calib instead; keep 3D guide only for RGB-only path.
        if usesMlScorer {
            arView.scene.anchors.removeAll()
        } else if let plane = boardPlane {
            placeGuide(at: plane)
        }
        statusText = String(format: "Мишень OK · r=%.0f", img.radiusPx)
        liveLog(
            "DARTS_LIVE event=tripod_ok rPx=\(Int(img.radiusPx)) bull=\(Int(img.cx)),\(Int(img.cy)) guide=\(usesMlScorer ? "rgb2d" : "plane3d")"
        )
        if markReady {
            tripodReady = true
        }
        return true
    }

    /// Project RGB board circle into ARView coordinates for the 2D overlay.
    /// Uses the ARView's own bounds for displayTransform (must match camera presentation).
    func projectCalibToView(viewSize: CGSize) -> (center: CGPoint, radius: CGFloat)? {
        guard let calib = boardImageCalib,
              let frame = arView.session.currentFrame
        else { return nil }
        // Prefer live ARView bounds — GeometryReader size can disagree with camera mapping.
        let vs = arView.bounds.size.width > 8 ? arView.bounds.size : viewSize
        guard vs.width > 8, vs.height > 8 else { return nil }

        let res = frame.camera.imageResolution
        let iw = CGFloat(res.width)
        let ih = CGFloat(res.height)
        guard iw > 1, ih > 1 else { return nil }

        let display = frame.displayTransform(for: interfaceOrientation, viewportSize: vs)

        func toView(_ ix: Float, _ iy: Float) -> CGPoint {
            var p = CGPoint(x: CGFloat(ix) / iw, y: CGFloat(iy) / ih)
            p = p.applying(display)
            return CGPoint(x: p.x * vs.width, y: p.y * vs.height)
        }

        let c = toView(calib.cx, calib.cy)
        let edge = toView(calib.cx + calib.radiusPx, calib.cy)
        var r = hypot(edge.x - c.x, edge.y - c.y)
        // Also sample +Y edge — displayTransform can anisotropically scale.
        let edgeY = toView(calib.cx, calib.cy + calib.radiusPx)
        r = max(r, hypot(edgeY.x - c.x, edgeY.y - c.y))
        guard r.isFinite, r > 4 else { return nil }

        // Map into the overlay's coordinate space if it differs from arView.bounds.
        if abs(vs.width - viewSize.width) > 1 || abs(vs.height - viewSize.height) > 1 {
            let sx = viewSize.width / vs.width
            let sy = viewSize.height / vs.height
            return (
                CGPoint(x: c.x * sx, y: c.y * sy),
                r * (sx + sy) * 0.5
            )
        }
        return (c, r)
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
        statusText = usesMlScorer ? "ML · кидай" : "RGB · кидай"
        coaching?.removeFromSuperview()
        coaching = nil
        liveLog("DARTS_LIVE event=start_scoring mode=\(usesMlScorer ? "ml+H" : "rgb_only") status=\(mlScorer.statusLine)")
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
        statusText = "Достаньте дротики"
        liveLog("DARTS_LIVE event=wait_removal")
    }

    /// Undo / cancel handoff — resume listening for throws.
    func resumeListening() {
        guard isScoring else { return }
        if usesMlScorer {
            mlScorer.cancelWaitingForClear()
            statusText = "ML · ждёт дротик"
        } else {
            scorer.cancelWaitingForClear()
            statusText = "RGB 2D · ждёт дротик"
        }
        liveLog("DARTS_LIVE event=resume_listening")
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

    /// Fully automatic from tripod.
    /// ML (DartsMind-style): YOLO 4 calib points → H. RGB-only: hollow surround fallback.
    private func tryAutoCalibrate(frame: ARFrame) {
        guard isRunning, !isScoring, !tripodReady else { return }
        if usesMlScorer {
            tryMlCalibrate(frame: frame)
            return
        }
        tryBullCalibrate(frame: frame)
    }

    /// On-device tip+calib model → homography (no color bull).
    private func tryMlCalibrate(frame: ARFrame) {
        let t = frame.timestamp
        guard t - lastBullAutoAt > 0.10 else { return }
        lastBullAutoAt = t

        guard let result = mlScorer.tryLockCalib(frame: frame) else {
            statusText = "ML · точки доски…"
            if Int(t * 2) % 3 == 0 {
                liveLog("DARTS_LIVE event=ml_calib miss status=\(mlScorer.statusLine)")
            }
            return
        }

        boardImageCalib = result.imageCalib
        bullLocked = true
        arView.scene.anchors.removeAll()
        statusText = "ML \(result.streak)/\(result.need)…"
        liveLog(
            "DARTS_LIVE event=ml_calib streak=\(result.streak)/\(result.need) rPx=\(Int(result.imageCalib.radiusPx)) bull=\(Int(result.imageCalib.cx)),\(Int(result.imageCalib.cy))"
        )

        guard result.locked else { return }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        statusText = "ML · кидай"
        liveLog(
            "DARTS_LIVE event=auto_calib_done src=ml+H rPx=\(Int(result.imageCalib.radiusPx)) bull=\(Int(result.imageCalib.cx)),\(Int(result.imageCalib.cy)) ml=1"
        )
        tripodReady = true
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
}

extension LidarSession: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        Task { @MainActor in
            let t = frame.timestamp

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
                statusText = "Мишень свободна"
                liveLog("DARTS_LIVE BOARD_CLEARED")
                onBoardCleared?()
            case .none:
                if t - lastStatusRefresh > 0.4 {
                    lastStatusRefresh = t
                    let n = diag.dartsInVisit
                    if diag.waitingClear {
                        statusText = "Достаньте дротики · \(n)/3"
                    } else if usesMlScorer {
                        if diag.phase == "settle" || diag.phase == "settleEmpty" || diag.phase == "calibrating" {
                            statusText = "ML · прогрев…"
                        } else {
                            statusText = "ML ждёт \(n + 1)/3"
                        }
                    } else if diag.phase == "settle" {
                        statusText = "Зафиксировано \(n)/3…"
                    } else if diag.arming || !diag.ready {
                        statusText = "Не двигай… снимок мишени"
                    } else {
                        statusText = "RGB ждёт \(n + 1)/3 · \(diag.rgbPixels)"
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
