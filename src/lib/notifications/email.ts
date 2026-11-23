import "server-only";
import { Resend } from "resend";
import { PROOF_BUCKET } from "@/lib/product-rules";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Notifier, PlacedOrder } from "./index";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function modeLabel(mode: string): string {
  if (mode === "name") return "اكتب اسمك عليه";
  if (mode === "design") return "تصميم مخصص";
  return "بدون تخصيص";
}

export const emailNotifier: Notifier = {
  name: "resend-email",
  async send(order: PlacedOrder) {
    const apiKey = process.env.RESEND_API_KEY;
    const recipient = process.env.ORDER_NOTIFICATION_EMAIL || "timafatma948@gmail.com";

    if (!apiKey) {
      console.warn("RESEND_API_KEY is not set. Order notification email skipped.");
      return;
    }

    const resend = new Resend(apiKey);

    // Fetch proof image if available and attach / embed it in the email
    const attachments: { filename: string; content: Buffer }[] = [];
    let proofSignedUrl: string | null = null;
    if (order.paymentProofPath) {
      try {
        const sb = createServiceClient();
        const [{ data: fileBlob }, { data: signedData }] = await Promise.all([
          sb.storage.from(PROOF_BUCKET).download(order.paymentProofPath),
          // Valid signed URL for 30 days so Gmail proxy can render it reliably
          sb.storage.from(PROOF_BUCKET).createSignedUrl(order.paymentProofPath, 60 * 60 * 24 * 30),
        ]);

        if (signedData?.signedUrl) {
          proofSignedUrl = signedData.signedUrl;
        }

        if (fileBlob) {
          const buffer = Buffer.from(await fileBlob.arrayBuffer());
          const ext = order.paymentProofPath.split(".").pop() || "png";
          attachments.push({
            filename: `proof-${order.number}.${ext}`,
            content: buffer,
          });
        }
      } catch (err) {
        console.error("Failed to load payment proof for email attachment:", err);
      }
    }

    const itemsRows = order.items
      .map((item, idx) => {
        let customizationHtml = "";
        if (item.pieces && item.pieces.length > 0) {
          customizationHtml = `
            <div style="margin-top: 6px; font-size: 13px; color: #555;">
              ${item.pieces
                .map(
                  (p) => `
                <div style="margin-top: 3px;">
                  <b>${escapeHtml(p.label)}:</b> ${p.colorName ? `اللون: ${escapeHtml(p.colorName)} | ` : ""}${
                    p.text ? `الاسم: ${escapeHtml(p.text)}` : ""
                  }${p.designName ? `التصميم: ${escapeHtml(p.designName)}` : ""}
                </div>`
                )
                .join("")}
            </div>`;
        } else if (item.mode !== "standard") {
          customizationHtml = `
            <div style="margin-top: 4px; font-size: 13px; color: #555;">
              <span style="background: #f3ede2; padding: 2px 8px; border-radius: 4px; display: inline-block;">
                ${modeLabel(item.mode)}
              </span>
              ${item.text ? `<span style="margin-right: 6px;"><b>الاسم:</b> ${escapeHtml(item.text)}</span>` : ""}
              ${item.colorName ? `<span style="margin-right: 6px;"><b>اللون:</b> ${escapeHtml(item.colorName)}</span>` : ""}
              ${item.font ? `<span style="margin-right: 6px;"><b>الخط:</b> ${escapeHtml(item.font)}</span>` : ""}
            </div>`;
        }

        return `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; text-align: right; vertical-align: top;">
              <div style="font-weight: bold; color: #111;">${escapeHtml(item.productName)}</div>
              ${customizationHtml}
            </td>
            <td style="padding: 12px; text-align: center; vertical-align: top; color: #444;">${item.qty}</td>
            <td style="padding: 12px; text-align: left; vertical-align: top; color: #111; font-weight: bold;">
              ${(item.unitPrice * item.qty).toLocaleString("ar-EG")} ج.م
            </td>
          </tr>
        `;
      })
      .join("");

    const locationText = [
      order.governorate,
      order.place ? `(${order.place})` : "",
      order.area,
      order.address,
    ]
      .filter(Boolean)
      .join(" - ");

    const depositInfoHtml = order.depositAmount > 0
      ? `
        <div style="background: #fff8eb; border: 1px solid #ffd899; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 6px 0; color: #8a5300; font-size: 15px;">بيانات العربون المطلوب</h3>
          <p style="margin: 0; font-size: 14px; color: #333;">
            <b>العربون (${order.depositPercent ?? 50}%):</b> ${order.depositAmount.toLocaleString("ar-EG")} ج.م<br />
            <b>المتبقي:</b> ${(order.total - order.depositAmount).toLocaleString("ar-EG")} ج.م<br />
            ${order.depositMethod ? `<b>طريقة التحويل:</b> ${escapeHtml(order.depositMethod)}<br />` : ""}
          </p>
          ${
            proofSignedUrl
              ? `
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ffd899;">
              <div style="font-weight: bold; margin-bottom: 8px; color: #8a5300; font-size: 14px;">صورة إثبات التحويل:</div>
              <a href="${proofSignedUrl}" target="_blank" style="display: block; text-decoration: none;">
                <img src="${proofSignedUrl}" alt="إثبات التحويل" style="max-width: 100%; max-height: 400px; object-fit: contain; border-radius: 6px; border: 1px solid #e0c59e; display: block;" />
              </a>
              <div style="margin-top: 8px;">
                <a href="${proofSignedUrl}" target="_blank" style="display: inline-block; background: #17233d; color: #fff; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-size: 12px;">
                  فتح الصورة بالحجم الكامل ↗
                </a>
              </div>
            </div>`
              : ""
          }
        </div>
      `
      : "";

    const customizationNotesHtml = order.customizationNotes
      ? `
        <div style="background: #fdf5e6; border: 1px solid #ecd3a7; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 6px 0; color: #734503; font-size: 15px;">ملاحظات التخصيص للمنتجات</h3>
          <p style="margin: 0; font-size: 14px; color: #222; white-space: pre-wrap;">${escapeHtml(order.customizationNotes)}</p>
        </div>
      `
      : "";

    const customerNotesHtml = order.notes
      ? `
        <div style="background: #f9f9f9; border: 1px solid #eee; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 6px 0; color: #555; font-size: 14px;">ملاحظات العميل العامة</h3>
          <p style="margin: 0; font-size: 14px; color: #333; white-space: pre-wrap;">${escapeHtml(order.notes)}</p>
        </div>
      `
      : "";

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>طلب جديد #${order.number}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #faf8f5; margin: 0; padding: 24px; direction: rtl; text-align: right; color: #222;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #eee;">
          
          <!-- Header -->
          <div style="background: #17233d; color: #fff; padding: 24px 28px;">
            <h1 style="margin: 0; font-size: 22px; font-weight: bold;">طلب جديد #${order.number}</h1>
            <p style="margin: 6px 0 0; font-size: 14px; color: #ffb91f;">متجر فاطمة — وصلك طلب جديد عبر الموقع</p>
          </div>

          <div style="padding: 24px 28px;">
            
            <!-- Customer Details -->
            <div style="background: #fcfcfc; border: 1px solid #eee; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #17233d; border-bottom: 1px solid #eee; padding-bottom: 8px;">بيانات العميل</h2>
              <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 4px 0; color: #666; width: 110px;">الاسم:</td>
                  <td style="padding: 4px 0; font-weight: bold; color: #111;">${escapeHtml(order.customerName)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #666;">رقم الموبايل:</td>
                  <td style="padding: 4px 0; font-weight: bold; color: #111;">
                    <a href="tel:${escapeHtml(order.phone)}" style="color: #17233d; text-decoration: none;">${escapeHtml(order.phone)}</a>
                    &nbsp;|&nbsp;
                    <a href="https://wa.me/20${escapeHtml(order.phone.replace(/^0+/, ""))}" target="_blank" style="color: #25D366; text-decoration: none; font-weight: normal;">واتساب</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #666;">العنوان:</td>
                  <td style="padding: 4px 0; color: #111;">${escapeHtml(locationText)}</td>
                </tr>
              </table>
            </div>

            ${customizationNotesHtml}
            ${customerNotesHtml}
            ${depositInfoHtml}

            <!-- Items -->
            <h2 style="margin: 20px 0 12px 0; font-size: 16px; color: #17233d;">المنتجات المطلوبة</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
              <thead>
                <tr style="background: #f7f5f0; color: #555;">
                  <th style="padding: 10px 12px; text-align: right; border-radius: 0 6px 6px 0;">المنتج</th>
                  <th style="padding: 10px 12px; text-align: center; width: 60px;">الكمية</th>
                  <th style="padding: 10px 12px; text-align: left; width: 100px; border-radius: 6px 0 0 6px;">السعر</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>

            <!-- Summary -->
            <div style="background: #faf8f5; border-radius: 8px; padding: 16px; font-size: 14px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 4px 0; color: #666;">سعر المنتجات:</td>
                  <td style="padding: 4px 0; text-align: left; font-weight: bold;">${order.subtotal.toLocaleString("ar-EG")} ج.م</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #666;">الشحن:</td>
                  <td style="padding: 4px 0; text-align: left; font-weight: bold;">${order.shipping.toLocaleString("ar-EG")} ج.م</td>
                </tr>
                <tr style="border-top: 1px solid #e5e0d8;">
                  <td style="padding: 10px 0 4px; font-size: 16px; font-weight: bold; color: #17233d;">الإجمالي:</td>
                  <td style="padding: 10px 0 4px; text-align: left; font-size: 18px; font-weight: bold; color: #17233d;">
                    ${order.total.toLocaleString("ar-EG")} ج.م
                  </td>
                </tr>
              </table>
            </div>

          </div>

          <!-- Footer -->
          <div style="background: #f3efe6; padding: 14px 28px; text-align: center; font-size: 12px; color: #777;">
            طلب جديد تم تسجيله على متجر فاطمة &bull; <bdi dir="ltr">#${order.number}</bdi>
          </div>
        </div>
      </body>
      </html>
    `;

    const { error } = await resend.emails.send({
      from: "متجر فاطمة <onboarding@resend.dev>",
      to: recipient,
      subject: `طلب جديد #${order.number} من ${order.customerName} (${order.total.toLocaleString("ar-EG")} ج.م)`,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) {
      console.error("Resend send failed:", error);
    }
  },
};
