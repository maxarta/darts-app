import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var bridge: NativeBridge
    @EnvironmentObject private var lidar: LidarSession

    private var arActive: Bool {
        lidar.isRunning || lidar.isScoring
    }

    var body: some View {
        ZStack {
            // Same color under island / home bar — no white strips.
            AppTheme.background
                .ignoresSafeArea()

            // Web stays INSIDE the safe area so the menu is never under the clock.
            WebContainerView(bridge: bridge)

            // Keep a single ARView mounted for the whole session — removing it
            // after «Готово» pauses ARKit and dart detection dies.
            if arActive {
                GeometryReader { geo in
                    let calibrating = bridge.showLidarCalibrate
                    let w = calibrating ? geo.size.width : 128
                    let h = calibrating ? geo.size.height : 172
                    ZStack {
                        ARViewContainer(arView: lidar.arView)
                        // RGB bull ring — source of truth for ML scoring alignment.
                        if lidar.boardImageCalib != nil {
                            BoardCalibRingOverlay()
                                .environmentObject(lidar)
                        }
                    }
                    .frame(width: w, height: h)
                    .clipShape(
                        RoundedRectangle(
                            cornerRadius: calibrating ? 0 : 14,
                            style: .continuous
                        )
                    )
                    .overlay {
                        if !calibrating {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(Color.yellow.opacity(0.85), lineWidth: 2)
                        }
                    }
                    .position(
                        x: calibrating ? geo.size.width / 2 : geo.size.width - 76,
                        y: calibrating ? geo.size.height / 2 : 118
                    )
                }
                .ignoresSafeArea()
                .allowsHitTesting(bridge.showLidarCalibrate)
                .zIndex(5)
            }

            if bridge.showLidarCalibrate {
                LidarCalibrateChrome(
                    onCancel: {
                        lidar.stop()
                        bridge.showLidarCalibrate = false
                        bridge.sendToWeb(["type": "autoScoreCancelled"])
                    },
                    onConfirm: { plane in
                        if lidar.boardPlane == nil {
                            lidar.boardPlane = plane
                        }
                        // ML path already startScoring() inside tryAutoCalibrate.
                        if !lidar.isScoring {
                            lidar.startScoring()
                        }
                        bridge.showLidarCalibrate = false
                        bridge.sendToWeb([
                            "type": "autoScoreReady",
                            "lidar": true,
                            "ml": lidar.usesMlScorer,
                            "supportsLidar": LidarSession.supportsSceneDepth,
                        ])
                    }
                )
                .environmentObject(lidar)
                .transition(.opacity)
                .zIndex(10)
            } else if lidar.isScoring {
                VStack {
                    HStack {
                        Spacer()
                        Text(lidar.statusText)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(.black.opacity(0.55), in: Capsule())
                            .padding(.trailing, 12)
                            .padding(.top, 286)
                    }
                    Spacer()
                }
                .allowsHitTesting(false)
                .zIndex(6)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: bridge.showLidarCalibrate)
        .onAppear {
            LiveTelemetry.setBridge { line in
                bridge.sendToWeb(["type": "autoScoreTelemetry", "line": line])
            }
            LiveTelemetry.clear()
            LiveTelemetry.log("DARTS_LIVE event=app_ready ml=\(lidar.usesMlScorer ? 1 : 0) hybrid=ml+H")
            bridge.onStartAutoScore = {
                LiveTelemetry.log("DARTS_LIVE event=web_start_autoscore ml=\(lidar.usesMlScorer ? 1 : 0)")
                if lidar.usesMlScorer {
                    // Hybrid: bull circle → Core ML tips. Chrome calls startPreview once.
                    lidar.onReadyForScoring = {
                        bridge.showLidarCalibrate = false
                        // lidar:true so web uses native visit/removal handoff
                        bridge.sendToWeb([
                            "type": "autoScoreReady",
                            "lidar": true,
                            "ml": true,
                            "supportsLidar": LidarSession.supportsSceneDepth,
                        ])
                    }
                    bridge.showLidarCalibrate = true
                } else if LidarSession.supportsSceneDepth {
                    lidar.onReadyForScoring = nil
                    bridge.showLidarCalibrate = true
                } else {
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
            bridge.onWaitForRemoval = {
                lidar.waitForRemoval()
            }
            bridge.onResumeListening = {
                lidar.resumeListening()
            }
            lidar.onDartScored = { [weak lidar] input in
                // Never forward throws while waiting for darts to be pulled.
                if lidar?.scorerWaitingForClear == true { return }
                let segment: Any
                switch input.segment {
                case .number(let n): segment = n
                case .miss: segment = "miss"
                case .bull25: segment = "bull25"
                case .bull50: segment = "bull50"
                }
                bridge.sendToWeb([
                    "type": "autoThrow",
                    "input": [
                        "segment": segment,
                        "multiplier": input.multiplier,
                    ] as [String: Any],
                    "confidence": input.confidence,
                    "source": lidar?.usesMlScorer == true ? "ml" : "rgb",
                ])
            }
            lidar.onBoardCleared = {
                bridge.sendToWeb(["type": "boardCleared"])
            }
        }
    }
}
