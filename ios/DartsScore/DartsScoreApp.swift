import SwiftUI

@main
struct DartsScoreApp: App {
    @StateObject private var bridge = NativeBridge()
    @StateObject private var lidar = LidarSession()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(bridge)
                .environmentObject(lidar)
                .preferredColorScheme(.dark)
        }
    }
}
