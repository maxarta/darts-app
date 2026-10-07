import Foundation
import Combine
import ARKit
import RealityKit
import UIKit

@MainActor
final class LidarSession: NSObject, ObservableObject {
    static var supportsSceneDepth: Bool {
        ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
    }

    @Published var isRunning = false
    @Published var isScoring = false
    @Published var statusText = "Наведите на мишень"
    @Published var hasLidar: Bool = LidarSession.supportsSceneDepth

    let arView = ARView(frame: .zero)
    var boardPlane: BoardPlane?
    var onDartScored: ((NativeThrowInput) -> Void)?

    private let scorer = DartScorer()
    private var coaching: ARCoachingOverlayView?

    override init() {
        super.init()
        arView.session.delegate = self
        arView.automaticallyConfigureSession = false
        arView.environment.background = .cameraFeed()
    }

    func startPreview() {
        guard Self.supportsSceneDepth else {
            statusText = "LiDAR недоступен на этом устройстве"
            return
        }
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.vertical]
        config.environmentTexturing = .automatic
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            config.frameSemantics.insert(.smoothedSceneDepth)
        }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }
        arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        isRunning = true
        isScoring = false
        scorer.reset()
        statusText = "Наведите на мишень и тапните в булл"
        installCoaching()
    }

    func startScoring() {
        isScoring = true
        scorer.reset()
        statusText = "Автоскоринг · ждёт дротик"
        coaching?.removeFromSuperview()
        coaching = nil
    }

    func stop() {
        arView.session.pause()
        isRunning = false
        isScoring = false
        boardPlane = nil
        scorer.reset()
        coaching?.removeFromSuperview()
        coaching = nil
        statusText = ""
    }

    /// Raycast tap → board plane from vertical surface + LiDAR mesh.
    func confirmBoard(at viewPoint: CGPoint) -> BoardPlane? {
        let results = arView.raycast(
            from: viewPoint,
            allowing: .estimatedPlane,
            alignment: .vertical
        )
        guard let first = results.first else {
            statusText = "Не вижу плоскость — подойдите ближе"
            return nil
        }

        let transform = first.worldTransform
        let center = SIMD3<Float>(
            transform.columns.3.x,
            transform.columns.3.y,
            transform.columns.3.z
        )
        // Estimated plane: normal from transform -Z (ARKit raycast).
        let normal = -SIMD3<Float>(
            transform.columns.2.x,
            transform.columns.2.y,
            transform.columns.2.z
        )
        let plane = BoardPlaneEstimator.makePlane(center: center, planeNormal: normal)
        boardPlane = plane
        statusText = "Мишень зафиксирована"
        placeGuide(at: plane)
        return plane
    }

    private func placeGuide(at plane: BoardPlane) {
        arView.scene.anchors.removeAll()
        let anchor = AnchorEntity(world: plane.center)
        let circle = MeshResource.generateCylinder(height: 0.002, radius: plane.radius)
        var material = SimpleMaterial(color: UIColor(red: 1, green: 0.8, blue: 0.1, alpha: 0.35), isMetallic: false)
        material.roughness = 1.0
        let entity = ModelEntity(mesh: circle, materials: [material])
        // Cylinder default axis is Y — rotate to board normal.
        let yAxis = SIMD3<Float>(0, 1, 0)
        let rotation = simd_quatf(from: yAxis, to: simd_normalize(plane.normal))
        entity.orientation = rotation
        anchor.addChild(entity)

        // Top tick for segment 20
        let tick = MeshResource.generateBox(size: [0.008, 0.002, 0.04])
        let tickEntity = ModelEntity(
            mesh: tick,
            materials: [SimpleMaterial(color: .systemYellow, isMetallic: false)]
        )
        tickEntity.position = plane.up * (plane.radius * 0.92)
        tickEntity.orientation = rotation
        anchor.addChild(tickEntity)

        arView.scene.addAnchor(anchor)
    }

    private func installCoaching() {
        coaching?.removeFromSuperview()
        let overlay = ARCoachingOverlayView()
        overlay.session = arView.session
        overlay.goal = .verticalPlane
        overlay.activatesAutomatically = true
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
}

extension LidarSession: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        Task { @MainActor in
            guard isScoring, let plane = boardPlane else { return }
            if let hit = scorer.analyze(
                frame: frame,
                plane: plane,
                orientation: interfaceOrientation
            ) {
                statusText = "Дротик: \(label(hit))"
                onDartScored?(hit)
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
