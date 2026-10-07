import SwiftUI
import RealityKit

struct LidarCalibrateView: View {
    @EnvironmentObject private var lidar: LidarSession
    var onCancel: () -> Void
    var onConfirm: (BoardPlane) -> Void

    @State private var lockedPlane: BoardPlane?

    var body: some View {
        ZStack {
            ARViewContainer(arView: lidar.arView)
                .ignoresSafeArea()
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onEnded { value in
                            let point = value.location
                            if let plane = lidar.confirmBoard(at: point) {
                                lockedPlane = plane
                            }
                        }
                )

            VStack {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("НАСТОЯЩИЙ LiDAR")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.white.opacity(0.7))
                        Text(lidar.statusText)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white)
                            .shadow(radius: 4)
                    }
                    Spacer()
                    Text(LidarSession.supportsSceneDepth ? "sceneDepth" : "нет LiDAR")
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.black.opacity(0.45), in: Capsule())
                        .foregroundStyle(LidarSession.supportsSceneDepth ? .green : .orange)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                Spacer()

                Text("Тап по буллу · сектор 20 сверху")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.bottom, 8)

                HStack(spacing: 12) {
                    Button("Отмена") {
                        onCancel()
                    }
                    .buttonStyle(GhostButtonStyle())

                    Button("Готово") {
                        if let plane = lockedPlane ?? lidar.boardPlane {
                            onConfirm(plane)
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(lockedPlane == nil && lidar.boardPlane == nil)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .background(Color.black)
        .onAppear {
            lidar.startPreview()
        }
    }
}

struct ARViewContainer: UIViewRepresentable {
    let arView: ARView
    func makeUIView(context: Context) -> ARView { arView }
    func updateUIView(_ uiView: ARView, context: Context) {}
}

private struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.bold))
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Color.yellow)
            .foregroundStyle(.black)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
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
