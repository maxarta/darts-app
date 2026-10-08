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
        userContent.addUserScript(NativeBridge.bootstrapScript)

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
        // Let UIKit respect safe area for the scroll view chrome; page itself
        // sits in the safe rect because SwiftUI does not ignoreSafeArea here.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.isOpaque = true
        webView.backgroundColor = AppTheme.uiBackground
        webView.scrollView.backgroundColor = AppTheme.uiBackground
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = AppTheme.uiBackground
        }

        bridge.webView = webView
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
        private var didRetry = false

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
            bridge.webView = webView
            bridge.sendToWeb([
                "type": "nativeReady",
                "supportsLidar": LidarSession.supportsSceneDepth,
            ])
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            retryIfNeeded(webView)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            retryIfNeeded(webView)
        }

        private func retryIfNeeded(_ webView: WKWebView) {
            guard !didRetry else { return }
            didRetry = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                webView.load(URLRequest(url: self.bridge.startURL))
            }
        }
    }
}
