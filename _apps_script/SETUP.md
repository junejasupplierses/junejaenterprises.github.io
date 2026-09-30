# Enquiry form with email OTP - one-time setup (about 10 minutes)

The website cannot send email by itself (GitHub Pages only shows pages). This small
Google script, running in **your** Google account, does two things:

1. emails the visitor a 6-digit code, and
2. after the visitor types the right code, emails the enquiry to
   **info@junejaenterprises.com** (press Reply to answer the visitor).

This folder starts with `_`, so GitHub Pages does not publish it.

## Steps

1. Open <https://script.google.com> while signed in to your Google account.
2. Click **New project**. Name it `Juneja enquiry form`.
3. Delete everything in the editor, then paste the whole of `Code.gs` from this folder.
   Press **Save** (the disk icon).
4. At the top, choose the function **testSetup** and press **Run**.
   Google asks for permission ("send email as you") - press **Review permissions**,
   choose your account, then **Advanced -> Go to Juneja enquiry form (unsafe) -> Allow**.
   ("unsafe" only means Google has not reviewed your own private script.)
   A test email "Enquiry form is connected" arrives at info@junejaenterprises.com.
5. Press **Deploy -> New deployment**. Click the gear next to "Select type" and choose **Web app**.
   - Description: `v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
   Press **Deploy** and copy the **Web app URL** (it ends with `/exec`).
6. Send that URL to Claude. It goes into one line of `index.html` (`ENQUIRY_API`).
   The URL is not a password - it is fine for it to be visible in the page.

## Good to know

- The code email is sent from your Google account's address, with the name
  "Juneja Enterprises" and Reply-To info@junejaenterprises.com.
- A free Gmail account can send about 100 script emails a day. The script stops at
  70 codes and 25 enquiries a day so it never uses up that limit; after that the
  page asks visitors to email info@junejaenterprises.com directly.
- Changing the script later: edit, Save, then **Deploy -> Manage deployments ->
  (pencil) -> Version: New version -> Deploy**. The URL stays the same.
- Until the URL is added to the page, the form keeps working the old way
  (it opens the visitor's email app).
