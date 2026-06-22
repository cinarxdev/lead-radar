<div align="center">

<br/>

# 🛰️ Lead Radar Pro

**Google Maps Keşfi · Yapay Zeka Zenginleştirme · Canlı Dashboard — Hepsi Tek Panelde**

<br/>

<table>
  <tr>
    <td width="50%" valign="top"><img src="https://i.imgur.com/2Q27SlG.png" alt="Önizleme 1" width="100%" /></td>
    <td width="50%" valign="top"><img src="https://i.imgur.com/kebrAYl.png" alt="Önizleme 2" width="100%" /></td>
  </tr>
</table>

</div>

---

## ❓ Ne bu?

**Lead Radar Pro**, yerel işletmeleri (cafe, restoran, tatlıcı vb.) hedefleyen ve Google Maps üzerinden lokal taramalar yapan gelişmiş bir lead (müşteri adayı) keşif motorudur.  
Bulunan kayıtları yapay zeka (OpenRouter) ile zenginleştirerek yenilik skorları atar, platform üyeliklerini analiz eder ve tüm bu süreçleri premium karanlık tema arayüzünde (dashboard) canlı olarak takip etmenizi sağlar.

---

## ✨ Öne Çıkan Özellikler

- 📍 **Harita Bölge Seçimi** — Haritada daire veya poligon çizerek tarama alanını görsel olarak belirleme (Leaflet entegrasyonu)
- ⚙️ **Lokal Maps Scraper** — Harici API maliyetleri olmadan çalışan güçlü Go tabanlı tarayıcı (`google-maps-scraper.exe`)
- 🤖 **AI Zenginleştirme (OpenRouter)** — OpenRouter modelleri (Gemini, DeepSeek, Llama vb.) ile işletmeleri analiz edip kalite skorlaması (0-10), yapay zeka notu ve bir sonraki aksiyon önerisi üretme
- 🛠️ **Özelleştirilebilir AI & Model Ayarları** — Panel üzerindeki ayarlar kısmından OpenRouter API Key, Base URL ve kullanılacak modelleri canlı olarak değiştirebilme
- 📋 **Dinamik Veri Alanları (Fields)** — Haritadan çekilecek ve panelde listelenecek kolonları (telefon, web sitesi, puan, yorum vb.) dinamik olarak belirleme
- 📊 **Canlı Pipeline Takibi** — Arama motorunun ve yapay zeka agent'larının (geo-router, lead-cleaner, enricher) anlık çalışma durumunu ağ şemasında izleme

---

## 💻 Kullanılan Teknolojiler

```
Node.js (Backend) · Vanilla Javascript (Frontend) · Vanilla CSS (Glassmorphism & animations)
Leaflet (Interactive Maps) · Lucide Icons · OpenRouter API
```

---

## 🚀 Kurulum ve Çalıştırma

**Gereksinimler:** Node.js 20+, Windows İşletim Sistemi (Lokal scraper `.exe` dosyası için).

1. Bağımlılıklar (Herhangi bir paket yüklemesi gerekmez, proje tamamen Node'un yerleşik API'leriyle çalışır)

```bash
# Projeyi kurmak için direkt dizine girin
cd lead-radar-pro
```

2. Ortam Değişkenleri — Projeyi çalıştırmadan önce `lead-radar-pro` klasörü içinde `.env` dosyası oluşturun ve OpenRouter API anahtarınızı girin:

```env
PORT=3030
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPAT_API_KEY=your_openrouter_api_key_here
MODEL_CLASSIFIER=google/gemini-2.5-flash:free
MODEL_ENRICHER=google/gemini-2.5-flash:free
```

*Not: Paneldeki "Ayarlar" sekmesinden bu değerleri istediğiniz zaman canlı olarak da değiştirebilirsiniz.*

3. Sunucuyu Başlatma

Ana dizinde (veya `lead-radar-pro` dizini içinde) şu komutu çalıştırarak sunucuyu başlatın:

```bash
npm start
```

Tarayıcınızdan panel arayüzüne erişin: [`http://localhost:3030`](http://localhost:3030)

---

## 📂 Proje Yapısı

```
lead-radar-pro/
├── src/                 # Sunucu mantığı
│   ├── server.mjs       # Sunucu API uçları ve yönlendirmeleri
│   ├── orchestrator.mjs # İş akışı yönetimi (tarama, zenginleştirme, lokal kayıt)
│   ├── store.mjs        # Lokal JSON veritabanı okuma/yazma (research-db, main-active)
│   ├── scraper.mjs      # Google Maps tarama scriptlerini tetikleyen kod
│   ├── enricher.mjs     # OpenRouter yapay zeka sorgularını atan zenginleştirici
│   └── fields.mjs       # Veri alanları katalog yönetimi
├── public/              # Dashboard Arayüzü (Frontend)
│   ├── index.html       # Ana arayüz tasarımı
│   ├── app.js           # Harita, veri çekme ve dinamik tablo listeleme kodları
│   └── styles.css       # Premium karanlık tema & cam efekti (CSS)
├── data/                # Lokal veritabanı (.json dosyaları, Gitignore ile korunur)
└── tools/               # Lokal Maps Scraper dosyaları (Gitignore ile korunur)
```

---

## 📞 İletişim

Herhangi bir sorunuz, öneriniz veya projenin kurulumu/kullanımı hakkında yardıma ihtiyacınız olursa benimle [Instagram üzerinden](https://instagram.com/cinarxkn) iletişime geçebilirsiniz. 💬✨
