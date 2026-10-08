import SwiftUI
import RealityKit
import simd

/// Minimal chrome — auto-calibrates from tripod, user only cancels.
struct LidarCalibrateChrome: View {
    @EnvironmentObject private var lidar: LidarSession
    var onCancel: () -> Void
    var onConfirm: (BoardPlane) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(lidar.usesMlScorer ? "Автокалибровка · ML" : "Автокалибровка · RGB")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.7))
                    Text(lidar.statusText)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                        .shadow(radius: 4)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 12)
            .background(
                LinearGradient(
                    colors: [.black.opacity(0.55), .clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )

            Spacer().allowsHitTesting(false)

            VStack(spacing: 10) {
                Text(
                    lidar.usesMlScorer
                        ? "Штатив напротив мишени · мишень в кадре\nИщем 4 точки доски (как DartsMind)…"
                        : "Штатив напротив мишени · не трогай телефон\nИщем красный булл…"
                )
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .multilineTextAlignment(.center)

                Button("Отмена") { onCancel() }
                    .buttonStyle(GhostButtonStyle())
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 16)
            .background(
                LinearGradient(
                    colors: [.clear, .black.opacity(0.65)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
        .onAppear {
            lidar.startPreview()
        }
        .onChange(of: lidar.tripodReady) { _, ready in
            guard ready else { return }
            // Plane optional — RGB calib is enough to start scoring.
            let plane = lidar.boardPlane ?? BoardPlane(
                center: .zero,
                normal: SIMD3<Float>(0, 0, 1),
                radius: BoardPlaneEstimator.standardRadius,
                up: SIMD3<Float>(0, 1, 0)
            )
            onConfirm(plane)
        }
    }
}

struct ARViewContainer: UIViewRepresentable {
    let arView: ARView
    func makeUIView(context: Context) -> ARView { arView }
    func updateUIView(_ uiView: ARView, context: Context) {}
}

/// 2D board ring from RGB bull calib (matches scoring space — not the drifting AR plane box).
struct BoardCalibRingOverlay: View {
    @EnvironmentObject private var lidar: LidarSession

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 15.0, paused: false)) { _ in
            GeometryReader { geo in
                Canvas { ctx, size in
                    guard let ring = lidar.projectCalibToView(viewSize: size) else { return }
                    var circle = Path(
                        ellipseIn: CGRect(
                            x: ring.center.x - ring.radius,
                            y: ring.center.y - ring.radius,
                            width: ring.radius * 2,
                            height: ring.radius * 2
                        )
                    )
                    ctx.stroke(circle, with: .color(.yellow.opacity(0.9)), lineWidth: 2.5)

                    // Bull crosshair
                    let arm: CGFloat = 10
                    var cross = Path()
                    cross.move(to: CGPoint(x: ring.center.x - arm, y: ring.center.y))
                    cross.addLine(to: CGPoint(x: ring.center.x + arm, y: ring.center.y))
                    cross.move(to: CGPoint(x: ring.center.x, y: ring.center.y - arm))
                    cross.addLine(to: CGPoint(x: ring.center.x, y: ring.center.y + arm))
                    ctx.stroke(cross, with: .color(.red.opacity(0.85)), lineWidth: 2)

                    // Outer crop hint (ML ROI) — square around board
                    let side = ring.radius * 2.35
                    let sq = CGRect(
                        x: ring.center.x - side / 2,
                        y: ring.center.y - side / 2,
                        width: side,
                        height: side
                    )
                    ctx.stroke(Path(roundedRect: sq, cornerRadius: 4), with: .color(.cyan.opacity(0.55)), lineWidth: 1.5)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
        }
        .allowsHitTesting(false)
    }
}

private struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.bold))
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Color.white.opacity(0.12))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
