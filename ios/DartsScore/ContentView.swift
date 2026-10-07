import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var bridge: NativeBridge
    @EnvironmentObject private var lidar: LidarSession

    var body: some View {
        ZStack {
            WebContainerView(bridge: bridge)
                .ignoresSafeArea()

            if bridge.showLidarCalibrate {
                LidarCalibrateView(
                    onCancel: {
                        lidar.stop()
                        bridge.showLidarCalibrate = false
                        bridge.sendToWeb(["type": "autoScoreCancelled"])
                    },
                    onConfirm: { plane in
                        lidar.boardPlane = plane
                        lidar.startScoring()
                        bridge.showLidarCalibrate = false
                        bridge.sendToWeb([
                            "type": "autoScoreReady",
                            "lidar": true,
                            "supportsLidar": LidarSession.supportsSceneDepth,
                        ])
                    }
                )
                .environmentObject(lidar)
                .transition(.opacity)
                .zIndex(10)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: bridge.showLidarCalibrate)
        .onAppear {
            bridge.onStartAutoScore = {
                if LidarSession.supportsSceneDepth {
                    lidar.startPreview()
                    bridge.showLidarCalibrate = true
                } else {
                    // Non-Pro: tell web to use its camera fallback.
                    bridge.sendToWeb([
                        "type": "autoScoreFallback",
                        "reason": "no_lidar",
                        "supportsLidar": false,
                    ])
                }
            }
            bridge.onStopAutoScore = {
                lidar.stop()
                bridge.showLidarCalibrate = false
            }
            lidar.onDartScored = { input in
                bridge.sendToWeb([
                    "type": "autoThrow",
                    "input": [
                        "segment": input.segmentJson,
                        "multiplier": input.multiplier,
                    ],
                    "confidence": input.confidence,
                    "source": "lidar",
                ])
            }
        }
    }
}
