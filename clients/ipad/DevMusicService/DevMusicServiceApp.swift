import AVFAudio
import SwiftUI

@main
struct DevMusicServiceApp: App {
    init() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.allowAirPlay])
        try? session.setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            ClientView()
                .preferredColorScheme(.dark)
        }
    }
}

private struct ClientView: View {
    @StateObject private var browser = BrowserState()

    var body: some View {
        ZStack {
            Color(red: 0.035, green: 0.047, blue: 0.075)
                .ignoresSafeArea()

            PhaseWebView(state: browser)
                .ignoresSafeArea(.container, edges: .bottom)

            if let message = browser.errorMessage {
                errorCard(message)
            }
        }
        .overlay(alignment: .top) {
            if browser.isLoading {
                GeometryReader { proxy in
                    Capsule()
                        .fill(Color.cyan)
                        .frame(width: max(12, proxy.size.width * browser.progress), height: 3)
                        .animation(.easeOut(duration: 0.18), value: browser.progress)
                }
                .frame(height: 3)
                .allowsHitTesting(false)
            }
        }
    }

    private func errorCard(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 34, weight: .medium))
                .foregroundStyle(.cyan)

            Text("Phase is unavailable")
                .font(.title2.weight(.semibold))

            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Button("Try again") {
                browser.retry()
            }
            .buttonStyle(.borderedProminent)
            .tint(.cyan)
        }
        .padding(28)
        .frame(maxWidth: 420)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
        .padding(24)
    }
}
