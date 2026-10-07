import Foundation
import WebKit
import Combine

/// Bidirectional bridge: web ⇄ native (WKScriptMessageHandler).
@MainActor
final class NativeBridge: NSObject, ObservableObject {
    static let handlerName = "dartsNative"

    @Published var showLidarCalibrate = false

    weak var webView: WKWebView?

    var onStartAutoScore: (() -> Void)?
    var onStopAutoScore: (() -> Void)?

    /// App URL loaded in the shell. Override via scheme query `?url=` for local dev.
    var startURL: URL {
        if let override = UserDefaults.standard.string(forKey: "DartsStartURL"),
           let url = URL(string: override) {
            return url
        }
        return URL(string: "https://artdart.vercel.app")!
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
        injectBootstrap()
    }

    func handleMessage(body: Any) {
        guard let dict = body as? [String: Any],
              let type = dict["type"] as? String else { return }

        switch type {
        case "startAutoScore":
            onStartAutoScore?()
        case "stopAutoScore":
            onStopAutoScore?()
        case "ping":
            sendToWeb([
                "type": "pong",
                "supportsLidar": LidarSession.supportsSceneDepth,
                "native": true,
            ])
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

    private func injectBootstrap() {
        let js = """
        (function(){
          if (window.__dartsNativeBridgeInstalled) return;
          window.__dartsNativeBridgeInstalled = true;
          window.DartsNative = {
            isNative: true,
            supportsLidar: true,
            startAutoScore: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'startAutoScore'});
            },
            stopAutoScore: function(){
              window.webkit.messageHandlers.dartsNative.postMessage({type:'stopAutoScore'});
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
        let script = WKUserScript(
            source: js,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        webView?.configuration.userContentController.addUserScript(script)
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
