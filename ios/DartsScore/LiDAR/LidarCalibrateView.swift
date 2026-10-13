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
                Text("Штатив напротив мишени\nLiDAR: стена + центр мишени…")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .multilineTextAlignment(.center)

                if let vision = EmbeddedWebServer.shared.visionStreamURL()
                    ?? EmbeddedWebServer.shared.lanBaseURL()?.appendingPathComponent("vision.html")
                {
                    VStack(spacing: 4) {
                        Text("Vision в браузере на ТВ")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.yellow.opacity(0.9))
                        Text(vision.absoluteString.replacingOccurrences(of: "/vision.mjpg", with: "/vision.html"))
                            .font(.system(.caption, design: .monospaced).weight(.semibold))
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                            .textSelection(.enabled)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity)
                    .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

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

                    // Perspective outer double: projected ring (ellipse), not a pixel circle.
                    if ring.ring.count >= 8 {
                        var poly = Path()
                        poly.move(to: ring.ring[0])
                        for p in ring.ring.dropFirst() { poly.addLine(to: p) }
                        poly.closeSubpath()
                        ctx.stroke(poly, with: .color(.yellow.opacity(0.95)), lineWidth: 2.5)
                    } else {
                        var circle = Path(
                            ellipseIn: CGRect(
                                x: ring.center.x - ring.radius,
                                y: ring.center.y - ring.radius,
                                width: ring.radius * 2,
                                height: ring.radius * 2
                            )
                        )
                        ctx.stroke(circle, with: .color(.yellow.opacity(0.9)), lineWidth: 2.5)
                    }

                    // Calib landmarks 20/3/11/6 (cyan) — same points that build H.
                    for p in ring.calibPts {
                        let r: CGFloat = 5
                        ctx.fill(
                            Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)),
                            with: .color(.cyan.opacity(0.9))
                        )
                    }

                    let arm: CGFloat = 10
                    var cross = Path()
                    cross.move(to: CGPoint(x: ring.center.x - arm, y: ring.center.y))
                    cross.addLine(to: CGPoint(x: ring.center.x + arm, y: ring.center.y))
                    cross.move(to: CGPoint(x: ring.center.x, y: ring.center.y - arm))
                    cross.addLine(to: CGPoint(x: ring.center.x, y: ring.center.y + arm))
                    ctx.stroke(cross, with: .color(.red.opacity(0.85)), lineWidth: 2)
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

/// «Бросай» prompt + «Бросил» / «Чисто» buttons over the game web UI.
struct ThrowPromptChrome: View {
    @EnvironmentObject private var lidar: LidarSession

    var body: some View {
        VStack(spacing: 0) {
            Spacer().allowsHitTesting(false)

            VStack(spacing: 14) {
                Text(titleText)
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.45), radius: 6, y: 2)

                if !lidar.lastSnapshotLabels.isEmpty, lidar.throwPrompt == .pullDarts {
                    Text(lidar.lastSnapshotLabels.joined(separator: "  ·  "))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.yellow)
                        .shadow(radius: 4)
                } else                 if lidar.throwPrompt == .throwNow {
                    Text("Кинь 1–3 дротика в мишень")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                    if let vision = EmbeddedWebServer.shared.lanBaseURL()?
                        .appendingPathComponent("vision.html")
                    {
                        Text(vision.absoluteString)
                            .font(.system(.caption2, design: .monospaced).weight(.semibold))
                            .foregroundStyle(.yellow.opacity(0.85))
                            .multilineTextAlignment(.center)
                            .textSelection(.enabled)
                    }
                }

                if lidar.throwPrompt == .throwNow {
                    Button {
                        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                        lidar.userTappedThrown()
                    } label: {
                        Text("Бросил")
                            .font(.title2.weight(.heavy))
                            .frame(maxWidth: .infinity, minHeight: 64)
                            .background(Color.green)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                } else if lidar.throwPrompt == .scoring {
                    ProgressView()
                        .tint(.white)
                        .padding(.vertical, 12)
                } else if lidar.throwPrompt == .pullDarts {
                    Text("Вынь дротики с мишени")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        lidar.userConfirmedClear()
                    } label: {
                        Text("Чисто — дальше")
                            .font(.headline.weight(.bold))
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(Color.white.opacity(0.18))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 28)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [.clear, .black.opacity(0.72), .black.opacity(0.88)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
        .allowsHitTesting(true)
    }

    private var titleText: String {
        switch lidar.throwPrompt {
        case .throwNow:
            return lidar.statusText.hasPrefix("Не вижу") ? lidar.statusText : "Бросай"
        case .scoring:
            return "Считаю…"
        case .pullDarts:
            return "Достаньте дротики"
        }
    }
}
