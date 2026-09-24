import Combine
import SwiftUI
import WebKit

#if canImport(UIKit)
import UIKit
private typealias PlatformWebViewRepresentable = UIViewRepresentable
#elseif canImport(AppKit)
import AppKit
private typealias PlatformWebViewRepresentable = NSViewRepresentable
#endif

@MainActor
final class BrowserState: ObservableObject {
    @Published var isLoading = true
    @Published var progress = 0.05
    @Published var errorMessage: String?

    fileprivate weak var webView: WKWebView?

    func retry() {
        errorMessage = nil
        isLoading = true

        if let webView, webView.url != nil {
            webView.reload()
        } else {
            webView?.load(URLRequest(url: PhaseWebView.homeURL))
        }
    }
}

struct PhaseWebView: PlatformWebViewRepresentable {
    static let homeURL = URL(string: "https://phase.tail4752f5.ts.net:8443")!

    @ObservedObject var state: BrowserState

    func makeCoordinator() -> Coordinator {
        Coordinator(state: state)
    }

    #if canImport(UIKit)
    func makeUIView(context: Context) -> WKWebView {
        makeWebView(context: context)
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        state.webView = webView
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        dismantleWebView(webView, coordinator: coordinator)
    }
    #else
    func makeNSView(context: Context) -> WKWebView {
        makeWebView(context: context)
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        state.webView = webView
    }

    static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
        dismantleWebView(webView, coordinator: coordinator)
    }
    #endif

    private func makeWebView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        #if canImport(UIKit)
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsAirPlayForMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        #endif

        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true

        #if canImport(UIKit)
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.035, green: 0.047, blue: 0.075, alpha: 1)

        let refresh = UIRefreshControl()
        refresh.tintColor = .systemCyan
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        #endif

        context.coordinator.observe(webView)
        state.webView = webView
        webView.load(URLRequest(url: Self.homeURL, cachePolicy: .useProtocolCachePolicy))
        return webView
    }

    private static func dismantleWebView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.stopObserving()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let state: BrowserState
        private var progressObservation: NSKeyValueObservation?

        init(state: BrowserState) {
            self.state = state
        }

        func observe(_ webView: WKWebView) {
            progressObservation = webView.observe(\.estimatedProgress, options: [.initial, .new]) { [weak state] view, _ in
                Task { @MainActor in
                    state?.progress = max(0.05, min(1, view.estimatedProgress))
                }
            }
        }

        func stopObserving() {
            progressObservation = nil
        }

        #if canImport(UIKit)
        @objc func refresh(_ sender: UIRefreshControl) {
            state.webView?.reload()
            sender.endRefreshing()
        }
        #endif

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            state.isLoading = true
            state.errorMessage = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            state.isLoading = false
            state.progress = 1

            #if canImport(UIKit)
            webView.scrollView.refreshControl?.endRefreshing()
            #endif
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            show(error, in: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            show(error, in: webView)
        }

        private func show(_ error: Error, in webView: WKWebView) {
            let nsError = error as NSError
            guard nsError.code != NSURLErrorCancelled else { return }

            state.isLoading = false
            state.errorMessage = error.localizedDescription

            #if canImport(UIKit)
            webView.scrollView.refreshControl?.endRefreshing()
            #endif
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url,
                  let scheme = url.scheme?.lowercased()
            else {
                decisionHandler(.cancel)
                return
            }

            if scheme == "http" || scheme == "https" || scheme == "about" {
                decisionHandler(.allow)
                return
            }

            decisionHandler(.cancel)
            openExternally(url)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                    webView.load(URLRequest(url: url))
                } else {
                    openExternally(url)
                }
            }
            return nil
        }

        private func openExternally(_ url: URL) {
            #if canImport(UIKit)
            UIApplication.shared.open(url)
            #elseif canImport(AppKit)
            NSWorkspace.shared.open(url)
            #endif
        }
    }
}
