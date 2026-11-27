# EarnStationBD Android app

This is a lightweight Android WebView shell for the live EarnStationBD website.

- Package: `com.earnstationbd.app.debug` for the installable debug build
- Website: `https://earnstationbd.pages.dev/`
- Minimum Android: 6.0 (API 23)
- Build: GitHub Actions workflow `.github/workflows/android-apk.yml`
- Output artifact: `EarnStationBD-Android-debug`

The app loads the live website, so site updates appear without rebuilding the APK. Internet access is required. This debug APK is for testing and is not a Play Store release.
