# Code signing

LiveChat installers are currently **unsigned**. This page explains what that
costs us and the options to fix it. Nothing here is configured yet: it is a
reference for when we decide to sign.

## Why sign at all?

| Platform | Unsigned today                                                                                                                                                 | Signed                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Windows  | SmartScreen shows "Windows protected your PC". Users must click **More info → Run anyway**. Some antivirus tools flag the bundled `yt-dlp.exe` / `ffmpeg.exe`. | Publisher name shown, and SmartScreen warnings fade as the cert builds reputation. |
| macOS    | Gatekeeper blocks the app. Users must right-click → **Open**, or run `xattr -cr`. **Auto-update is disabled** (Squirrel.Mac refuses unsigned updates).         | Opens normally once also notarized. Auto-update can be turned on.                  |
| Linux    | AppImage is not signed by convention. Nothing to do.                                                                                                           | n/a                                                                                |

Windows auto-update works today without signing. electron-updater checks that
the installer matches the sha512 in `latest.yml`, but not who published it.
Signing adds publisher checks (`publisherName`).

## Windows options

### 1. SignPath Foundation: free for open source (recommended first try)

- [signpath.org](https://signpath.org) signs OSS releases for free with a
  certificate issued to the SignPath Foundation, so the publisher shown is
  "SignPath Foundation", not us.
- Requirements: OSI-approved license, public repo, builds done in CI (GitHub
  Actions), and an application/review step. They sign artifacts built by our
  workflow and nothing built on a laptop.
- Integration: upload the unsigned `.exe` from `release.yml` to SignPath with
  their GitHub Action, wait for the signed file, then attach it to the release.
  Note that `latest.yml` holds the sha512 of the installer, so it must be
  regenerated (or the signing done inside electron-builder via a custom
  `win.sign` hook) after signing, or auto-update will reject the file.
- Cost: free. Effort: medium (application plus workflow changes).

### 2. Azure Trusted Signing (Microsoft)

- Microsoft-managed signing service with a cert in our own (verified) name.
- Around $10/month (Basic tier). Requires identity validation: individual
  developers in some countries, or an organization with 3+ years of history.
  Check current eligibility before counting on it.
- electron-builder supports it natively (`win.azureSignOptions`), with
  credentials as GitHub secrets. Smallest workflow change of all options.
- SmartScreen reputation is good from the start.

### 3. OV (Organization Validation) code-signing certificate

- Bought from a CA (Sectigo, DigiCert, SSL.com...), roughly $200–400/year.
- Since June 2023 the private key **must live on a hardware token or cloud
  HSM**, so you can no longer just put a `.pfx` in GitHub secrets. Use the
  CA's cloud signing service (e.g. SSL.com eSigner) from CI.
- SmartScreen reputation builds up over time and downloads. (EV certs used to
  skip this, but Microsoft removed that advantage in 2024.)

## macOS: Apple Developer ID

- Requires the **Apple Developer Program**: $99/year.
- Two steps, both supported by electron-builder:
  1. **Sign** with a "Developer ID Application" certificate
     (`CSC_LINK` + `CSC_KEY_PASSWORD` secrets).
  2. **Notarize**: upload to Apple, who scans and approves it
     (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` secrets,
     `mac.notarize: true`).
- Bundled binaries (`yt-dlp_macos`, ffmpeg, `better_sqlite3.node`) must be
  signed too. electron-builder signs everything in the bundle, but `yt-dlp`
  self-updates at runtime into `userData/bin`, which is outside the bundle,
  so that copy is not affected.
- Needs a macOS runner (already the case in `release.yml`).

### Turning on macOS auto-update afterwards

1. Add a `zip` target next to `dmg` (Squirrel.Mac updates from the zip).
2. Build both arches in **one** electron-builder run (`--mac --x64 --arm64`)
   so a single `latest-mac.yml` lists both, which means shipping both
   `darwin-x64` and `darwin-arm64` better-sqlite3 prebuilds (both ship by default).
3. Upload `latest-mac.yml`, `*.zip` and `*.zip.blockmap` in `release.yml`.
4. Remove the `darwin` early return in `electron/updater.cjs`.

## Suggested order

1. Apply to SignPath Foundation (free). If accepted, wire it into `release.yml`.
2. If refused, or a publisher name of our own is wanted: Azure Trusted Signing.
3. macOS: only once there are enough mac users to justify $99/year.
