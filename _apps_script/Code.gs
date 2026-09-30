/**
 * Juneja Enterprises - enquiry form with email OTP.
 *
 * Runs as a Google Apps Script "Web app" in the owner's Google account.
 * The website (GitHub Pages) cannot send email by itself, so it calls this:
 *
 *   1. action "send_otp": emails a 6-digit code to the visitor's email.
 *   2. action "submit":   checks the code, then emails the enquiry to
 *                          ENQUIRY_TO (the visitor's email is the Reply-To).
 *
 * Safety:
 *   - The code itself is never stored, only a SHA-256 hash of it, for 10 min.
 *   - 5 wrong tries kill the code. Max 3 codes per email per hour.
 *   - Daily caps so a flood cannot use up the Gmail sending quota
 *     (a free Gmail account may send about 100 emails a day from scripts).
 *   - Hidden "website" field (honeypot): bots fill it, people do not.
 *   - Every field is length-limited and sent as plain text, never HTML.
 *
 * Setup steps: see SETUP.md in this folder.
 */

var ENQUIRY_TO = 'info@junejaenterprises.com';
var FROM_NAME = 'Juneja Enterprises';
var CODE_TTL_S = 600;          // a code lives 10 minutes
var MAX_TRIES = 5;             // wrong tries per code
var MAX_CODES_PER_EMAIL = 3;   // codes per email per hour
var MAX_CODES_PER_DAY = 70;    // all visitors together
var MAX_ENQUIRIES_PER_DAY = 25;

function doPost(e) {
  var req = {};
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return reply_({ ok: false, error: 'Bad request.' });
  }
  if (clean_(req.website, 200)) {
    // Honeypot filled: pretend it worked, do nothing.
    return reply_({ ok: true });
  }
  var action = String(req.action || '');
  try {
    if (action === 'send_otp') return reply_(sendOtp_(req));
    if (action === 'submit') return reply_(submit_(req));
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'Something went wrong. Please try again, or email ' + ENQUIRY_TO + '.' });
  }
  return reply_({ ok: false, error: 'Bad request.' });
}

function doGet() {
  return reply_({ ok: true, service: 'Juneja Enterprises enquiry form' });
}

function sendOtp_(req) {
  var email = normEmail_(req.email);
  if (!email) return { ok: false, error: 'Please enter a valid email address.' };
  var name = clean_(req.name, 100) || 'there';
  var cache = CacheService.getScriptCache();

  var perEmailKey = 'n:' + hash_(email);
  var sent = Number(cache.get(perEmailKey) || 0);
  if (sent >= MAX_CODES_PER_EMAIL) {
    return { ok: false, error: 'Too many codes for this email. Please wait an hour, or email ' + ENQUIRY_TO + '.' };
  }
  if (!takeDaily_('codes', MAX_CODES_PER_DAY)) {
    return { ok: false, error: 'We are receiving many requests. Please email ' + ENQUIRY_TO + ' directly.' };
  }

  var code = newCode_();
  cache.put('c:' + hash_(email), JSON.stringify({ h: hash_(email + '|' + code), t: 0 }), CODE_TTL_S);
  cache.put(perEmailKey, String(sent + 1), 3600);

  MailApp.sendEmail({
    to: email,
    name: FROM_NAME,
    replyTo: ENQUIRY_TO,
    subject: 'Your Juneja Enterprises verification code: ' + code,
    body: 'Dear ' + name + ',\n\n'
      + 'Your verification code is: ' + code + '\n\n'
      + 'Type it on the website to send your enquiry. The code is valid for 10 minutes.\n'
      + 'If you did not ask for this, you can ignore this email.\n\n'
      + 'Juneja Enterprises\nhttps://junejaenterprises.com'
  });
  return { ok: true };
}

function submit_(req) {
  var email = normEmail_(req.email);
  var code = String(req.code || '').replace(/\D/g, '');
  if (!email || code.length !== 6) return { ok: false, error: 'Please enter the 6-digit code from your email.' };

  var cache = CacheService.getScriptCache();
  var key = 'c:' + hash_(email);
  var raw = cache.get(key);
  if (!raw) return { ok: false, error: 'This code has expired. Please ask for a new code.' };
  var rec = JSON.parse(raw);
  if (rec.h !== hash_(email + '|' + code)) {
    rec.t = Number(rec.t || 0) + 1;
    if (rec.t >= MAX_TRIES) {
      cache.remove(key);
      return { ok: false, error: 'Too many wrong tries. Please ask for a new code.' };
    }
    cache.put(key, JSON.stringify(rec), CODE_TTL_S);
    return { ok: false, error: 'That code is not right. Please check your email and try again.' };
  }
  cache.remove(key);   // a code works once

  if (!takeDaily_('enquiries', MAX_ENQUIRIES_PER_DAY)) {
    return { ok: false, error: 'Please email ' + ENQUIRY_TO + ' directly today.' };
  }

  var name = clean_(req.name, 100);
  var phone = clean_(req.phone, 25);
  var service = clean_(req.service, 120);
  var query = clean_(req.query, 3000, true);
  var when = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd MMM yyyy, HH:mm');

  MailApp.sendEmail({
    to: ENQUIRY_TO,
    name: 'Website enquiry',
    replyTo: email,
    subject: 'New enquiry (email verified): ' + (name || email) + (service ? ' - ' + service : ''),
    body: 'A visitor verified their email and sent this enquiry from junejaenterprises.com.\n\n'
      + 'Name:     ' + (name || '-') + '\n'
      + 'Email:    ' + email + '  (VERIFIED by code)\n'
      + 'Phone:    ' + (phone || '-') + '  (not verified)\n'
      + 'Service:  ' + (service || '-') + '\n'
      + 'Received: ' + when + ' IST\n\n'
      + 'Query:\n' + (query || '-') + '\n\n'
      + 'Press Reply to answer the visitor directly.'
  });
  return { ok: true };
}

/* ---------- helpers ---------- */

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normEmail_(v) {
  var s = String(v || '').trim().toLowerCase();
  if (s.length > 120) return '';
  return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(s) ? s : '';
}

function clean_(v, max, multiline) {
  var s = String(v == null ? '' : v);
  s = multiline ? s.replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, '')
                : s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return s.trim().slice(0, max);
}

function hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function newCode_() {
  // 6 digits from a random UUID (Utilities.getUuid is not guessable from outside).
  var hex = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  var n = parseInt(hex, 16) % 1000000;
  return ('000000' + n).slice(-6);
}

function takeDaily_(what, max) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var day = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    var key = 'd:' + what;
    var rec = JSON.parse(props.getProperty(key) || '{}');
    if (rec.day !== day) rec = { day: day, n: 0 };
    if (rec.n >= max) return false;
    rec.n += 1;
    props.setProperty(key, JSON.stringify(rec));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Run this once from the editor to allow sending email (it sends a test to ENQUIRY_TO). */
function testSetup() {
  MailApp.sendEmail(ENQUIRY_TO, 'Enquiry form is connected', 'The website enquiry form can now send email.');
}
