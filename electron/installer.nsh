; Extra NSIS steps for the Windows installer (wired in package.json → build.nsis.include).
;
; The uninstaller has no data-removal option built in (only a fixed config switch).
; Instead we ask a Yes/No question: the user data folder holds the Discord bot token,
; the OBS password and Instagram/TikTok cookies, so a streamer removing LiveChat should
; be able to wipe it, while someone reinstalling may want to keep their setup.

; electron-builder hides the progress log entirely ("nevershow" in its common.nsh).
; "hide" restores the usual "Show details" button: collapsed, but one click away.
; customHeader is inserted after common.nsh, so these lines win.
!macro customHeader
  ShowInstDetails hide
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails hide
  !endif
!macroend

; First page of the (assisted) installer: say what LiveChat is and what will happen, in
; French and English (one bilingual text: no per-language strings to keep in sync).
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "LiveChat ${VERSION}"
  !define MUI_WELCOMEPAGE_TEXT "LiveChat affiche sur OBS les vidéos, images et liens postés dans un salon Discord.$\r$\n$\r$\nL'installation va :$\r$\n  • copier l'application dans le dossier de votre choix ;$\r$\n  • créer un raccourci sur le Bureau et dans le menu Démarrer.$\r$\nAu premier lancement, un assistant vous aide à connecter votre bot Discord.$\r$\n$\r$\n---$\r$\n$\r$\nLiveChat shows videos, images and links posted in a Discord channel on OBS.$\r$\n$\r$\nSetup will copy the app to the folder you choose and create Desktop and Start menu shortcuts. On first launch, a wizard helps you connect your Discord bot."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; The app is unpacked from one compressed archive with logging turned off
; (SetDetailsPrint none), so "Show details" would stay empty: print a short summary
; of what was done instead. Bilingual, like the rest of this file.
!macro customInstall
  SetDetailsPrint both
  DetailPrint "Application installée dans / installed in: $INSTDIR"
  DetailPrint "Raccourcis créés / shortcuts created: Bureau, menu Démarrer / Desktop, Start menu"
  DetailPrint "Vos données / your data (réglages, token, cookies): $APPDATA\${PRODUCT_NAME}"
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "Application supprimée / app removed: $INSTDIR"
  ; Auto-updates run the old uninstaller before installing the new version: never ask
  ; (and never delete) then. Silent uninstalls (/S) keep the data too.
  ${ifNot} ${isUpdated}
    IfSilent livechat_keep_data
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "Supprimer aussi vos données LiveChat ?$\r$\n(réglages, token du bot Discord, mot de passe OBS, cookies, cache)$\r$\n$\r$\nAlso delete your LiveChat data?$\r$\n(settings, Discord bot token, OBS password, cookies, cache)$\r$\n$\r$\nOui / Yes : tout est supprimé / everything is removed$\r$\nNon / No : conservé pour une réinstallation / kept for a reinstall" \
      /SD IDNO IDNO livechat_keep_data
      ; Electron always stores data per user, even for an all-users install.
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      RMDir /r "$APPDATA\${APP_FILENAME}"
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
      !endif
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      !endif
      DetailPrint "Données supprimées / data deleted: $APPDATA\${PRODUCT_NAME}"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
      Goto livechat_data_done
    livechat_keep_data:
      DetailPrint "Données conservées / data kept: $APPDATA\${PRODUCT_NAME}"
    livechat_data_done:
  ${endif}
!macroend
