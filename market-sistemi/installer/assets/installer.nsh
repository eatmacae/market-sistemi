; Market Sistemi NSIS Özel Başlık Dosyası
; Türkçe dil desteği ve kurulum öncesi kontroller

; Kurulum öncesi mesaj
!macro customHeader
  ; Başlık çubuğu metni
  Caption "Market Yönetim Sistemi — Kurulum Sihirbazı"
!macroend

; Kurulum tamamlandı sayfası özelleştirmesi
!macro customInstallMode
  ; Tüm kullanıcılar için kur
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "InstallMode"
!macroend
