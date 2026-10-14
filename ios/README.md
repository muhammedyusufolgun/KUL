# Soru Hazırlama Asistanı – iOS

Android uygulamasının son **tek şık** sürümünü esas alan iPhone/iPad Xcode projesidir.

## Özellikler

- TXT, PDF, DOCX ve XLSX soru/cevap dosyaları
- Fotoğraf seçimi ve Apple Vision ile cihaz içi metin okuma
- Eşleşmeyen cevaplar için A–E harfini elle girme
- Yüzde 100 cevap eşleşmesi sağlanınca test adı ve Kaydet alanının açılması
- Kayıtlı testleri tekrar çözme; her soruda tek şık seçebilme
- Test Başla (açık yeşil), Test Bitir (açık sarı), Cevapları Göster/Gizle (açık mavi)
- Sarı zemin üzerinde siyah kalın S uygulama ikonu

## Xcode kurulumu

1. Apple macOS bilgisayarında Xcode 16 veya üstünü kullanın. Hedef iOS 16.0+.
2. GitHub Actions bölümünden **iOS-Xcode-Kaynak** artefaktını indirin; zip'i açın.
3. `SoruHazirlamaAsistani.xcodeproj` dosyasını Xcode ile açın.
4. Signing & Capabilities > Team alanında Apple hesabınızı seçin. Gerekirse Bundle Identifier'ı değiştirin.
5. iPhone'u bağlayıp Run düğmesiyle uygulamayı imzalayarak yükleyin. Gerekirse Developer Mode'u etkinleştirin.

macOS üzerinde sıfırdan kaynak çekildiyse önce:
```bash
python3 -m venv .venv
.venv/bin/pip install Pillow
.venv/bin/python ios/scripts/prepare-ios-web.py
bash ios/scripts/prepare-web.sh
brew install xcodegen
cd ios && xcodegen generate
```

## IPA ve imzalama

GitHub Actions imzasız `.ipa` (varsa) ve iOS Simulator `.app` oluşturur. **İmzasız IPA iPhone'a doğrudan yüklenemez.** Xcode ile kendi Apple geliştirici hesabınız üzerinden imzalı IPA veya cihaz kurulumu yapılmalıdır.

## Gizlilik ve teknik notlar

Soru kayıtları cihazda WebKit yerel depolamasında tutulur; cihazdan dışarı gönderilmez. PDF, Word ve Excel JavaScript bileşenleri pakete dahil edilir. Fotoğraf OCR Apple Vision ile cihazda çalışır. Bu proje fiziksel iPhone üzerinde test edilmemiştir.
