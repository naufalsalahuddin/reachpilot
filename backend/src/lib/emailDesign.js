"use strict";
/**
 * Email DESIGN templates (HTML layouts that wrap the email body).
 *
 * Emails are sent as plain text by default. When a campaign selects a design
 * template, the plain-text body is converted to simple HTML and injected into
 * the design's {{content}} placeholder, then sent as the HTML alternative part.
 *
 * Placeholders a design may use:
 *   {{content}}          the email body (already HTML)  — required
 *   {{subject}}          the email subject
 *   {{preheader}}        hidden inbox-preview text
 *   {{brand_name}}       workspace / sender brand name
 *   {{brand_primary}}    brand primary colour (hex)
 *   {{brand_secondary}}  brand secondary colour (hex)
 *   {{logo_url}}         absolute URL to the logo
 *   {{unsubscribe_url}}  one-click unsubscribe link (empty when disabled)
 *   {{year}}             current year
 */

const BASE = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const DEFAULTS = [
  {
    name: "Simple",
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="${BASE};font-size:15px;line-height:1.6;color:#172b4d;padding:8px 4px;">
        {{content}}
      </td></tr>
      <tr><td style="${BASE};font-size:12px;color:#8993a4;padding:20px 4px 0;border-top:1px solid #dfe1e6;">
        {{brand_name}}{{unsubscribe_block}}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
  },
  {
    name: "Branded header",
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dfe1e6;border-radius:8px;overflow:hidden;">
      <tr><td style="background:{{brand_primary}};padding:18px 28px;">
        <span style="${BASE};font-size:17px;font-weight:600;color:#ffffff;">{{brand_name}}</span>
      </td></tr>
      <tr><td style="${BASE};font-size:15px;line-height:1.6;color:#172b4d;padding:28px;">
        {{content}}
      </td></tr>
      <tr><td style="${BASE};font-size:12px;color:#8993a4;padding:18px 28px;background:#fafbfc;border-top:1px solid #dfe1e6;">
        © {{year}} {{brand_name}}{{unsubscribe_block}}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
  },
  {
    name: "Card + button",
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #dfe1e6;border-radius:10px;">
      <tr><td style="${BASE};font-size:15px;line-height:1.6;color:#172b4d;padding:32px 32px 8px;">
        {{content}}
      </td></tr>
      <tr><td align="left" style="padding:12px 32px 28px;">
        <a href="{{booking_link}}" style="${BASE};display:inline-block;background:{{brand_primary}};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:6px;">Book a quick call</a>
      </td></tr>
      <tr><td style="${BASE};font-size:12px;color:#8993a4;padding:16px 32px;border-top:1px solid #dfe1e6;">
        {{brand_name}}{{unsubscribe_block}}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
  },
];

/** Convert plain-text body to minimal safe HTML (paragraphs + line breaks). */
function textToHtml(text) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return String(text || "")
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px;">${esc(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Wrap already-rendered HTML content in a design template.
 * @param {string} designHtml  the template's html column
 * @param {object} ctx  { contentHtml, subject, preheader, brand:{name,primary,secondary,logo}, unsubscribeUrl, bookingLink }
 */
function wrapWithDesign(designHtml, ctx = {}) {
  const brand = ctx.brand || {};
  const unsub = ctx.unsubscribeUrl
    ? ` · <a href="${ctx.unsubscribeUrl}" style="color:#8993a4;">Unsubscribe</a>`
    : "";
  const map = {
    content: ctx.contentHtml || "",
    subject: ctx.subject || "",
    preheader: ctx.preheader || "",
    brand_name: brand.name || "",
    brand_primary: brand.primary || "#1c97e6",
    brand_secondary: brand.secondary || "#0b6fb8",
    logo_url: brand.logo || "",
    booking_link: ctx.bookingLink || "#",
    unsubscribe_url: ctx.unsubscribeUrl || "",
    unsubscribe_block: unsub,
    year: String(new Date().getFullYear()),
  };
  return String(designHtml).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m
  );
}

module.exports = { DEFAULTS, wrapWithDesign, textToHtml };
