name: Build Android APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Kodu Cek
        uses: actions/checkout@v4

      - name: Node.js Kur
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Java Kur
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: 17

      - name: Capacitor Projesi Olustur
        run: |
          npm init -y
          npm install @capacitor/core @capacitor/cli @capacitor/android
          npx cap init "Soru Hazirlama Asistani" "com.asistan.soruhazirlama" --web-dir .
          npx cap add android

      - name: APK Derle
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: APK Dosyasini Yayina Hazirla
        uses: actions/upload-artifact@v4
        with:
          name: Soru-Hazirlama-Asistani
          path: android/app/build/outputs/apk/debug/app-debug.apk
