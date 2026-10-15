# Key — Kriptografi Android

Blogdaki Akıllı Kriptografi Aracı, açık kırmızı temalı çevrimdışı Android WebView uygulamasıdır. Uygulama adı **Kriptografi**, launcher simgesindeki metin **Key** olarak ayarlanmıştır.

- Fotoğraf seçildiğinde cihaz üzerindeki ML Kit OCR metni otomatik olarak okur. Metin alanından da fotoğraf seçip OCR sonucunu girişe aktarabilirsiniz.
- Fotoğraftan alınan mesaj görsele varsayılan olarak PNG biçiminde eklenir. Kullanıcı yalnızca bu mesajı AES ile şifrelemeyi seçer.
- PNG ve metin indirmeleri `Downloads/Key` klasörüne kaydedilir.
- PDF / Yazdır düğmesi Android sistem yazdırma ekranını açar.
- Başlık uygulamayı ilk açılış durumuna sıfırlar; Çıkış düğmesi uygulamayı kapatır.
- Metin işlemlerinde tek yöntem seçilir; gelişmiş çok aşamalı şifreleme kaldırılmıştır.
- Minimum Android sürümü 6.0 (API 23). OCR modeli uygulamaya eklenir ve metin tanıma cihazda yapılır.

Projeyi Android Studio ile açıp `app > Build > Build APK(s)` ile derleyebilirsiniz. GitHub Actions HTML/JavaScript sözdizimini, manifesti, Gradle birim test görevini, APK derlemesini ve imzasını doğrular; APK `Key-APK` artifact olarak yüklenir.
