import SwiftUI
import WebKit

struct WebContainerView: UIViewRepresentable {
    let bridge: NativeBridge

    func makeCoordinator() -> Coordinator {
        Coordinator(bridge: bridge)
    }

    func makeUIView(context: Context) -> WKWebView {
        let userContent = WKUserContentController()
        userContent.add(context.coordinator, name: NativeBridge.handlerName)

        let config = WKWebViewConfiguration()
        config.userContentController = userContent
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)

        bridge.attach(to: webView)
        context.coordinator.webView = webView

        var request = URLRequest(url: bridge.startURL)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        webView.load(request)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let bridge: NativeBridge
        weak var webView: WKWebView?

        init(bridge: NativeBridge) {
            self.bridge = bridge
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            bridge.handleMessage(body: message.body)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            bridge.attach(to: webView)
            bridge.sendToWeb([
                "type": "nativeReady",
                "supportsLidar": LidarSession.supportsSceneDepth,
            ])
        }
    }
}
