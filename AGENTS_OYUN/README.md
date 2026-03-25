# FightBoard — Oyun Projesi Agent'ları

Bu klasör FightBoard board game projesine ait agent'ları içerir.
Market Yönetim Sistemi reposunda opsiyonel olarak saklanmaktadır.

Oyun projesine geçerken bu klasörü kopyala → AGENTS/ olarak yeniden adlandır.

## Agent Listesi

| No  | Agent                  | Sorumluluk                              |
|-----|------------------------|-----------------------------------------|
| 02  | GameDesigner           | GDD, balans, mini oyun kuralları        |
| 04  | GameplayDeveloper      | Karo sistemi, eşyalar, NPC, tur akışı   |
| 05  | MultiplayerDeveloper   | UGS, NGO, crossplay (PC/Android/iOS)    |
| 07  | Artist2D3D             | Karakterler, harita, eşya ikonları      |
| 08  | Animator               | Karakter, eşya efekti, UI animasyonları |
| 09  | LevelDesigner          | 7 harita düzeni, karo dağılımı          |
| 10  | SoundDesigner          | SFX, müzik, FMOD entegrasyonu           |
| 13  | PublishingSpecialist   | Mağaza sayfaları, lansman, yasal        |

## Ortak Agent'lar (AGENTS/ ile paylaşılır)
- 01_ProjectManager → Her iki proje için uyarlanmalı
- 03_LeadDeveloper  → Unity mimarisine göre uyarlanmalı
- 11_QAEngineer     → Oyun test senaryolarına göre uyarlanmalı
- 12_DevOps         → Steam / Google Play / App Store build'e göre uyarlanmalı
