"""
Market Yönetim Sistemi — Gmail SMTP Mail Servisi
Gece raporu, yedek, stok uyarısı ve fiyat zammı bildirimleri için kullanılır.
"""

import smtplib
import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from email.mime.base      import MIMEBase
from email                import encoders
from pathlib              import Path
from typing               import Optional

logger = logging.getLogger("market_sistemi.mailer")


def _smtp_baglanti() -> smtplib.SMTP_SSL:
    """
    Gmail SMTP bağlantısı kurar.
    Ortam değişkenlerinden kullanıcı adı ve şifreyi okur.
    """
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_EMAIL", "")
    pwd  = os.getenv("SMTP_PASSWORD", "")

    if not user or not pwd:
        raise EnvironmentError(
            "SMTP_EMAIL ve SMTP_PASSWORD ortam değişkenleri tanımlı değil. "
            "Mail gönderilemez."
        )

    smtp = smtplib.SMTP_SSL(host, port)
    smtp.login(user, pwd)
    return smtp


def mail_gonder(
    alici     : str,
    konu      : str,
    govde_html: str,
    govde_duz : Optional[str]   = None,
    ekler     : Optional[list]  = None,   # [(dosya_yolu, dosya_adi), ...]
) -> bool:
    """
    HTML destekli mail gönderir, opsiyonel ek desteği var.

    Args:
        alici      : Alıcı e-posta adresi
        konu       : Mail konusu
        govde_html : HTML içerik
        govde_duz  : Düz metin yedek (HTML görünmeyince)
        ekler      : [(dosya_yolu, dosya_adi)] listesi

    Returns:
        True → gönderildi, False → hata oluştu
    """
    gonderen = os.getenv("SMTP_EMAIL", "")

    mesaj = MIMEMultipart("alternative")
    mesaj["From"]    = gonderen
    mesaj["To"]      = alici
    mesaj["Subject"] = konu

    # Düz metin yedek
    if govde_duz:
        mesaj.attach(MIMEText(govde_duz, "plain", "utf-8"))

    # HTML gövde
    mesaj.attach(MIMEText(govde_html, "html", "utf-8"))

    # Ekler
    if ekler:
        for dosya_yolu, dosya_adi in ekler:
            yol = Path(dosya_yolu)
            if not yol.exists():
                logger.warning(f"Ek dosya bulunamadı, atlanıyor: {dosya_yolu}")
                continue

            with open(yol, "rb") as f:
                parca = MIMEBase("application", "octet-stream")
                parca.set_payload(f.read())

            encoders.encode_base64(parca)
            parca.add_header(
                "Content-Disposition",
                f'attachment; filename="{dosya_adi}"',
            )
            mesaj.attach(parca)

    try:
        smtp = _smtp_baglanti()
        smtp.sendmail(gonderen, alici, mesaj.as_string())
        smtp.quit()
        logger.info(f"Mail gönderildi → {alici} | Konu: {konu}")
        return True

    except EnvironmentError as e:
        logger.warning(f"Mail yapılandırması eksik: {e}")
        return False

    except smtplib.SMTPException as e:
        logger.error(f"SMTP hatası: {e}")
        return False

    except Exception as e:
        logger.error(f"Mail gönderme hatası: {e}", exc_info=True)
        return False


# ============================================================
# HAZIR ŞABLONLAR
# ============================================================

def stok_uyari_maili(
    alici         : str,
    kritik_urunler: list[dict],
    sube_adi      : str = "Merkez",
) -> bool:
    """
    Kritik stok seviyesindeki ürünler için uyarı maili.

    kritik_urunler: [{name, stock_qty, min_stock, unit}, ...]
    """
    if not kritik_urunler:
        return True

    satirlar = "\n".join(
        f"<tr>"
        f"<td style='padding:8px;border-bottom:1px solid #eee'>{u['name']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #eee;color:#F04F4F'>"
        f"{u['stock_qty']} {u['unit']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #eee'>"
        f"{u.get('min_stock', 0)} {u['unit']}</td>"
        f"</tr>"
        for u in kritik_urunler
    )

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#F04F4F">🔴 Kritik Stok Uyarısı — {sube_adi}</h2>
      <p>Aşağıdaki {len(kritik_urunler)} ürün minimum stok seviyesinin altına düştü:</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#F04F4F;color:#fff">
            <th style="padding:10px;text-align:left">Ürün</th>
            <th style="padding:10px;text-align:left">Mevcut</th>
            <th style="padding:10px;text-align:left">Min. Stok</th>
          </tr>
        </thead>
        <tbody>{satirlar}</tbody>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">
        Market Yönetim Sistemi — Otomatik Bildirim
      </p>
    </div>
    """

    return mail_gonder(
        alici      = alici,
        konu       = f"[{sube_adi}] 🔴 {len(kritik_urunler)} Ürün Kritik Stok Seviyesinde",
        govde_html = html,
        govde_duz  = f"{len(kritik_urunler)} ürün kritik stok seviyesinde.",
    )


def skt_uyari_maili(
    alici    : str,
    urunler  : list[dict],
    gun_sinir: int = 30,
    sube_adi : str = "Merkez",
) -> bool:
    """
    Son kullanma tarihi yaklaşan ürünler için uyarı maili.

    urunler: [{name, expiry_date, stock_qty, unit}, ...]
    """
    if not urunler:
        return True

    satirlar = "\n".join(
        f"<tr>"
        f"<td style='padding:8px;border-bottom:1px solid #eee'>{u['name']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #eee;color:#F5A623'>"
        f"{u['expiry_date']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #eee'>"
        f"{u['stock_qty']} {u['unit']}</td>"
        f"</tr>"
        for u in urunler
    )

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#F5A623">⚠️ Son Kullanma Tarihi Uyarısı — {sube_adi}</h2>
      <p>{len(urunler)} ürünün son kullanma tarihi {gun_sinir} gün içinde dolacak:</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#F5A623;color:#fff">
            <th style="padding:10px;text-align:left">Ürün</th>
            <th style="padding:10px;text-align:left">SKT</th>
            <th style="padding:10px;text-align:left">Mevcut Stok</th>
          </tr>
        </thead>
        <tbody>{satirlar}</tbody>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">
        Market Yönetim Sistemi — Otomatik Bildirim
      </p>
    </div>
    """

    return mail_gonder(
        alici      = alici,
        konu       = f"[{sube_adi}] ⚠️ {len(urunler)} Ürünün SKT'si {gun_sinir} Gün İçinde Doluyor",
        govde_html = html,
        govde_duz  = f"{len(urunler)} ürünün son kullanma tarihi yaklaşıyor.",
    )


def yedek_maili(
    alici     : str,
    zip_yolu  : Optional[str],
    z_raporu  : Optional[str],
    ozet      : dict,
    sube_adi  : str = "Merkez",
) -> bool:
    """
    Gün sonu yedek ve Z raporu maili.

    ozet: {tarih, toplam_satis, islem_sayisi, nakit, kart}
    """
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#12C98A">✅ Gün Sonu Raporu — {sube_adi}</h2>
      <p><strong>Tarih:</strong> {ozet.get('tarih', '-')}</p>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#12C98A;color:#fff">
          <th style="padding:10px;text-align:left">Özet</th>
          <th style="padding:10px;text-align:right">Tutar</th>
        </tr>
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">Toplam Satış</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">
            ₺{ozet.get('toplam_satis', 0):.2f}
          </td>
        </tr>
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">İşlem Sayısı</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">
            {ozet.get('islem_sayisi', 0)}
          </td>
        </tr>
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">Nakit</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">
            ₺{ozet.get('nakit', 0):.2f}
          </td>
        </tr>
        <tr>
          <td style="padding:8px">Kart</td>
          <td style="padding:8px;text-align:right">₺{ozet.get('kart', 0):.2f}</td>
        </tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">
        Ekler: Veritabanı yedeği ve Z raporu PDF'i.
        Market Yönetim Sistemi — Otomatik Bildirim
      </p>
    </div>
    """

    # Ekler: yedek ZIP + Z raporu PDF
    ekler = []
    if zip_yolu and Path(zip_yolu).exists():
        ekler.append((zip_yolu, Path(zip_yolu).name))
    if z_raporu and Path(z_raporu).exists():
        ekler.append((z_raporu, Path(z_raporu).name))

    return mail_gonder(
        alici      = alici,
        konu       = f"[{sube_adi}] ✅ Gün Sonu Raporu — {ozet.get('tarih', '')}",
        govde_html = html,
        govde_duz  = f"Toplam satış: ₺{ozet.get('toplam_satis', 0):.2f}",
        ekler      = ekler if ekler else None,
    )


def fiyat_zammi_maili(
    alici   : str,
    degisimler: list[dict],
    sube_adi: str = "Merkez",
) -> bool:
    """
    Fiyat takip sistemi tespitlerini bildirir.

    degisimler: [{tedarikci, urun, eski_fiyat, yeni_fiyat, degisim_yuzde}, ...]
    """
    if not degisimler:
        return True

    zamlar    = [d for d in degisimler if d.get("degisim_yuzde", 0) > 0]
    indirimler = [d for d in degisimler if d.get("degisim_yuzde", 0) < 0]

    def _satirlar(liste):
        return "\n".join(
            f"<tr>"
            f"<td style='padding:8px;border-bottom:1px solid #eee'>{d['tedarikci']}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #eee'>{d['urun']}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #eee'>₺{d['eski_fiyat']:.2f}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #eee'>₺{d['yeni_fiyat']:.2f}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #eee;"
            f"color:{'#F04F4F' if d['degisim_yuzde'] > 0 else '#12C98A'}'>"
            f"%{d['degisim_yuzde']:+.1f}</td>"
            f"</tr>"
            for d in liste
        )

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
      <h2 style="color:#4F8EF7">📊 Fiyat Değişim Raporu — {sube_adi}</h2>
      <p>{len(zamlar)} zam, {len(indirimler)} indirim tespit edildi.</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#4F8EF7;color:#fff">
            <th style="padding:10px;text-align:left">Tedarikçi</th>
            <th style="padding:10px;text-align:left">Ürün</th>
            <th style="padding:10px;text-align:left">Eski</th>
            <th style="padding:10px;text-align:left">Yeni</th>
            <th style="padding:10px;text-align:left">Değişim</th>
          </tr>
        </thead>
        <tbody>{_satirlar(degisimler)}</tbody>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">
        Market Yönetim Sistemi — Fiyat Takip Sistemi
      </p>
    </div>
    """

    return mail_gonder(
        alici      = alici,
        konu       = f"[{sube_adi}] 📊 {len(zamlar)} Zam / {len(indirimler)} İndirim Tespit Edildi",
        govde_html = html,
        govde_duz  = f"{len(zamlar)} zam, {len(indirimler)} indirim tespit edildi.",
    )
