# Phase iPad client

This SwiftUI app embeds the Phase web app in WKWebView. It supports inline
playback, AirPlay, playback audio sessions, progress display, pull-to-refresh,
and retry after a connection failure. It requires iPadOS 17 or later.

Open `DevMusicService.xcodeproj` in Xcode. The initial URL is
`PhaseWebView.homeURL`; the checked-in value uses the existing Phase tailnet
HTTPS endpoint, so the iPad needs access to that tailnet. Choose your development
team before signing a device build.

Build for the simulator without signing:

```sh
xcodebuild -project clients/ipad/DevMusicService.xcodeproj \
  -scheme DevMusicService -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/phase-ipad-build CODE_SIGNING_ALLOWED=NO build
```

Device playback, background audio, and AirPlay still need an on-device smoke
test. Simulator compilation does not validate the remote service or audio
behavior while the device is locked.
