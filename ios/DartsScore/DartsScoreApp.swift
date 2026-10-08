import SwiftUI
import UIKit

@main
struct DartsScoreApp: App {
    @StateObject private var bridge = NativeBridge()
    @StateObject private var lidar = LidarSession()

    init() {
        // Only the window — never UIView.appearance (that blanks WKWebView).
        UIWindow.appearance().backgroundColor = AppTheme.uiBackground
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(bridge)
                .environmentObject(lidar)
                .preferredColorScheme(.light)
                .background(AppTheme.background.ignoresSafeArea())
        }
    }
}
