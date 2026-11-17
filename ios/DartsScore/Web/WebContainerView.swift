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
        // Without a UI delegate window.confirm() silently returns false
        // («Покинуть игру», «Заново» never pass their confirm).
        webView.uiDelegate = context.coordinator
        webView.scrollView.bounces = false
        // Full-screen page; safe area reaches CSS via env() (viewport-fit=cover).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        // Clear so a transparent camera hole shows the picture behind the page.
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = .clear
        }

        bridge.webView = webView
        context.coordinator.webView = webView

        // Keep a fat disk cache — the SPA (JS/CSS/webp) should not re-download
        // on every launch. Previous .reloadIgnoringLocalCacheData forced a cold load.
        if URLCache.shared.diskCapacity < 200_000_000 {
            URLCache.shared = URLCache(
                memoryCapacity: 64 * 1024 * 1024,
                diskCapacity: 256 * 1024 * 1024
            )
        }

        let url = bridge.startURL
        LiveTelemetry.log("DARTS_LIVE event=webview_load_start url=\(url.absoluteString)")
        var request = URLRequest(url: url)
        request.cachePolicy = .useProtocolCachePolicy
        webView.load(request)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
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
            let url = webView.url?.absoluteString ?? "nil"
            LiveTelemetry.log("DARTS_LIVE event=webview_did_finish url=\(url)")
            bridge.sendToWeb([
                "type": "nativeReady",
                "supportsLidar": LidarSession.supportsSceneDepth,
            ])
            // Preview/prod bundles mount after first paint — confirm React root.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak webView] in
                webView?.evaluateJavaScript(
                    """
                    (function(){
                      var r=document.getElementById('root');
                      var kids=r?r.childElementCount:-1;
                      return JSON.stringify({
                        rootKids:kids,
                        hasReact:!!(r&&kids>0),
                        title:document.title,
                        href:location.href
                      });
                    })();
                    """
                ) { result, error in
                    if let error {
                        LiveTelemetry.log(
                            "DARTS_LIVE event=webview_probe_err \(error.localizedDescription)"
                        )
                    } else if let s = result as? String {
                        LiveTelemetry.log("DARTS_LIVE event=webview_probe \(s)")
                    }
                }
            }
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

        // MARK: - JS dialogs

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            present(alert, from: webView) { completionHandler() }
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "Да", style: .default) { _ in completionHandler(true) })
            present(alert, from: webView) { completionHandler(false) }
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptTextInputPanelWithPrompt prompt: String,
            defaultText: String?,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (String?) -> Void
        ) {
            let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
                completionHandler(alert?.textFields?.first?.text)
            })
            present(alert, from: webView) { completionHandler(nil) }
        }

        /// WebKit requires the completion handler to run exactly once.
        private func present(_ alert: UIViewController, from webView: WKWebView, fallback: () -> Void) {
            var top = webView.window?.rootViewController
            while let next = top?.presentedViewController { top = next }
            guard let top else {
                fallback()
                return
            }
            top.present(alert, animated: true)
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
