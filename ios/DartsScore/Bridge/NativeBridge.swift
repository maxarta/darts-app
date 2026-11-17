import Foundation
import UIKit
import WebKit
import Combine

/// Bidirectional bridge: web ⇄ native (WKScriptMessageHandler).
@MainActor
final class NativeBridge: NSObject, ObservableObject {
    static let handlerName = "dartsNative"

    /// Injected into WKUserContentController before WKWebView is created.
    static var bootstrapScript: WKUserScript {
        let js = """
        (function(){
          if (window.__dartsNativeBridgeInstalled) return;
          window.__dartsNativeBridgeInstalled = true;
          document.documentElement.classList.add('darts-native');
          window.DartsNative = {
            isNative: true,
            supportsLidar: true,
            startAutoScore: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'startAutoScore'});
            },
            stopAutoScore: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'stopAutoScore'});
            },
            waitForRemoval: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'waitForRemoval'});
            },
            resumeListening: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'resumeListening'});
            },
            undoThrow: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'undoThrow'});
            },
            userThrown: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'userThrown'});
            },
            userClear: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'userClear'});
            },
            setWebThrowUi: function(on){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'autoScoreUi', web: !!on});
            },
            ping: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'ping'});
            }
          };
          window.__dartsNative = window.__dartsNative || {};
          document.dispatchEvent(new CustomEvent('darts-native-ready', {
            detail: { supportsLidar: true }
          }));
        })();
        """
        return WKUserScript(
            source: js,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }

    @Published var showLidarCalibrate = false
    /// Web renders camera + throw panel itself; native hides its prompt and PiP.
    @Published var webOwnsThrowUi = false
    /// Viewport rect where the throw screen wants the live camera.
    @Published var cameraHole: CGRect = .zero

    weak var webView: WKWebView?

    var onStartAutoScore: (() -> Void)?
    var onStopAutoScore: (() -> Void)?
    var onWaitForRemoval: (() -> Void)?
    var onResumeListening: (() -> Void)?
    var onUndoThrow: (() -> Void)?
    var onUserThrown: (() -> Void)?
    var onUserClear: (() -> Void)?
    var onWebThrowUi: (() -> Void)?
    /// (dart index in visit, segment, multiplier) — user's correction.
    var onLabelThrow: ((Int, String, Int) -> Void)?

    /// App URL loaded in the shell.
    /// Default is production so the phone always gets the latest web (TV, UI, SW fixes).
    /// Overrides:
    /// - `DartsStartURL` — any absolute URL (Vite LAN, staging, …)
    /// - `DartsUseEmbeddedWeb` = true — bundled EmbeddedWeb snapshot (offline / local ML)
    var startURL: URL {
        if let override = UserDefaults.standard.string(forKey: "DartsStartURL"),
           let url = URL(string: override) {
            return url
        }
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "DartsUseEmbeddedWeb"),
           let embedded = EmbeddedWebServer.shared.startIfNeeded() {
            return embedded
        }
        #endif
        return URL(string: "https://artdart.vercel.app")!
    }

    func handleMessage(body: Any) {
        guard let dict = body as? [String: Any],
              let type = dict["type"] as? String else { return }

        switch type {
        case "startAutoScore":
            onStartAutoScore?()
        case "stopAutoScore":
            onStopAutoScore?()
        case "waitForRemoval":
            onWaitForRemoval?()
        case "resumeListening":
            onResumeListening?()
        case "undoThrow":
            onUndoThrow?()
        case "userThrown":
            onUserThrown?()
        case "userClear":
            onUserClear?()
        case "autoScoreUi":
            webOwnsThrowUi = (dict["web"] as? Bool) ?? false
            onWebThrowUi?()
        case "cameraHole":
            let x = (dict["x"] as? NSNumber)?.doubleValue ?? 0
            let y = (dict["y"] as? NSNumber)?.doubleValue ?? 0
            let w = (dict["w"] as? NSNumber)?.doubleValue ?? 0
            let h = (dict["h"] as? NSNumber)?.doubleValue ?? 0
            cameraHole = CGRect(x: x, y: y, width: w, height: h)
        case "labelThrow":
            guard let index = dict["index"] as? Int else { break }
            let seg = dict["segment"].map { "\($0)" } ?? "?"
            let mult = dict["multiplier"] as? Int ?? 1
            onLabelThrow?(index, seg, mult)
        case "ping":
            sendToWeb([
                "type": "pong",
                "supportsLidar": LidarSession.supportsSceneDepth,
                "native": true,
            ])
        case "playCue":
            let cue = dict["cue"] as? String ?? "hit"
            let step = (dict["step"] as? NSNumber)?.intValue
            GameSounds.shared.play(cue, step: step)
        case "haptic":
            NativeHaptics.play(dict["style"] as? String ?? "light")
        default:
            break
        }
    }

    func sendToWeb(_ payload: [String: Any]) {
        guard let webView,
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.__dartsNative && window.__dartsNative.onNativeMessage(\(json));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

@MainActor
private enum NativeHaptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private static let soft = UIImpactFeedbackGenerator(style: .soft)
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)

    static func play(_ style: String) {
        let generator: UIImpactFeedbackGenerator
        switch style {
        case "medium": generator = medium
        case "heavy": generator = heavy
        case "soft": generator = soft
        case "rigid": generator = rigid
        default: generator = light
        }
        generator.prepare()
        generator.impactOccurred()
        generator.prepare()
    }
}

extension NativeBridge: WKScriptMessageHandler {
    nonisolated func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        Task { @MainActor in
            handleMessage(body: message.body)
        }
    }
}
