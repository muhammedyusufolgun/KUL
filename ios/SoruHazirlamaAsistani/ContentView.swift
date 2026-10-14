import SwiftUI
import WebKit
import Vision
import UIKit

struct ContentView: View {
    var body: some View {
        QuestionWebView()
            .ignoresSafeArea(.container, edges: .bottom)
            .background(Color(red: 248/255, green: 250/255, blue: 252/255))
    }
}

struct QuestionWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let userContentController = WKUserContentController()
        userContentController.add(context.coordinator, name: "nativeOCR")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = userContentController
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 248/255, green: 250/255, blue: 252/255, alpha: 1)
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.keyboardDismissMode = .interactive
        context.coordinator.webView = webView

        // WebKit opens Files and Photos when a HTML file input is tapped.
        if let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
        } else {
            webView.loadHTMLString("<h3>Uygulama içeriği bulunamadı.</h3>", baseURL: nil)
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) { }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        weak var webView: WKWebView?

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "nativeOCR",
                  let payload = message.body as? [String: Any],
                  let id = payload["id"] as? String,
                  let dataURL = payload["data"] as? String,
                  dataURL.count < 25_000_000,
                  let comma = dataURL.firstIndex(of: ","),
                  let imageData = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
                  let image = UIImage(data: imageData),
                  let cgImage = image.cgImage else {
                if let payload = message.body as? [String: Any], let id = payload["id"] as? String {
                    sendResult(id: id, text: nil, error: "Görsel çözümlenemedi veya dosya çok büyük.")
                }
                return
            }

            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = true
                if #available(iOS 16.0, *) {
                    request.automaticallyDetectsLanguage = true
                }
                do {
                    try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
                    let observations = (request.results ?? []).sorted {
                        let delta = abs($0.boundingBox.midY - $1.boundingBox.midY)
                        if delta > 0.025 { return $0.boundingBox.midY > $1.boundingBox.midY }
                        return $0.boundingBox.midX < $1.boundingBox.midX
                    }
                    let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
                    DispatchQueue.main.async {
                        self?.sendResult(id: id, text: text, error: nil)
                    }
                } catch {
                    DispatchQueue.main.async {
                        self?.sendResult(id: id, text: nil, error: "Fotoğraf okunamadı: \(error.localizedDescription)")
                    }
                }
            }
        }

        private func sendResult(id: String, text: String?, error: String?) {
            let params: [String] = [id, text ?? "", error ?? ""]
            let jsonStrings = params.map { value -> String in
                guard let raw = try? JSONSerialization.data(withJSONObject: [value], options: [.fragmentsAllowed]),
                      let encoded = String(data: raw, encoding: .utf8) else { return "null" }
                return String(encoded.dropFirst().dropLast())
            }
            let javascript = "window.__resolveNativeOCR(\(jsonStrings.joined(separator: ",")));"
            webView?.evaluateJavaScript(javascript, completionHandler: nil)
        }
    }
}
