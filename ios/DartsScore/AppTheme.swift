import SwiftUI
import UIKit

/// Matches web game `--g-bg: #f9fafb` so system chrome (island / home bar) isn't white.
enum AppTheme {
    static let background = Color(red: 249 / 255, green: 250 / 255, blue: 251 / 255)
    static let uiBackground = UIColor(red: 249 / 255, green: 250 / 255, blue: 251 / 255, alpha: 1)
}
