; OSIEN Memories — Custom Dark-Glass NSIS Installer & Uninstaller Theme
; Matches the app palette: #0B1421 base, #F1F6FA text, #A5B3C0 muted, #9BF5EF aqua accent

!define MUI_BGCOLOR "0B1421"
!define MUI_TEXTCOLOR "F1F6FA"
!define MUI_INSTFILESPAGE_COLORS "F1F6FA 0B1421"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_HEADER_TRANSPARENT_TEXT

!define MUI_FINISHPAGE_TITLE "OSIEN Memories is ready"
!define MUI_FINISHPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TEXT "Installation is complete.$\r$\n$\r$\nConnect an unlocked iPhone or open any local folder to organize your photos and videos privately on this PC."

!define MUI_UNFINISHPAGE_TITLE "OSIEN Memories was removed"
!define MUI_UNFINISHPAGE_TITLE_3LINES
!define MUI_UNFINISHPAGE_TEXT "The application has been uninstalled.$\r$\n$\r$\nAll of your imported photos and videos remain completely untouched."

!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Launch OSIEN Memories now"
  !define MUI_FINISHPAGE_RUN_FUNCTION "LaunchMemories"
!endif

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Function LaunchMemories
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
    FunctionEnd
  !endif
!macroend

!macro customWelcomePage
  Page custom MemoriesWelcomeCreate MemoriesWelcomeLeave
!macroend

!macro customFinishPage
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  UninstPage custom un.MemoriesUninstallWelcomeCreate un.MemoriesUninstallWelcomeLeave
!macroend

!ifndef BUILD_UNINSTALLER
Function MemoriesWelcomeCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "" "0B1421"

  ; Eyebrow kicker
  ${NSD_CreateLabel} 12u 10u 280u 12u "PRIVATE MEDIA STUDIO"
  Pop $1
  CreateFont $2 "Segoe UI" 8 700
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "9BF5EF" "0B1421"

  ; Hero heading
  ${NSD_CreateLabel} 12u 24u 280u 34u "Your memories,$\r$\nbeautifully kept."
  Pop $1
  CreateFont $2 "Segoe UI" 19 700
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F1F6FA" "0B1421"

  ; Subtitle
  ${NSD_CreateLabel} 12u 64u 280u 26u "Bring photos and videos from your iPhone or a local folder into one clean, organized place."
  Pop $1
  CreateFont $2 "Segoe UI" 9.5 400
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "A5B3C0" "0B1421"

  ; Feature highlights
  ${NSD_CreateLabel} 12u 98u 280u 14u "•  Fast iPhone & local folder scanning"
  Pop $1
  CreateFont $2 "Segoe UI" 9.5 600
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F1F6FA" "0B1421"

  ${NSD_CreateLabel} 12u 115u 280u 14u "•  Non-destructive copy — originals stay untouched"
  Pop $1
  CreateFont $2 "Segoe UI" 9.5 600
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F1F6FA" "0B1421"

  ${NSD_CreateLabel} 12u 132u 280u 14u "•  100% local on your PC — no accounts or cloud"
  Pop $1
  CreateFont $2 "Segoe UI" 9.5 600
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F1F6FA" "0B1421"

  ; Footer hint
  ${NSD_CreateLabel} 12u 160u 280u 16u "Click Next to choose your install location and continue."
  Pop $1
  CreateFont $2 "Segoe UI" 8.5 400
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "738393" "0B1421"

  nsDialogs::Show
FunctionEnd

Function MemoriesWelcomeLeave
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
Function un.MemoriesUninstallWelcomeCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "" "0B1421"

  ; Eyebrow kicker
  ${NSD_CreateLabel} 12u 10u 280u 12u "OSIEN MEMORIES UNINSTALLER"
  Pop $1
  CreateFont $2 "Segoe UI" 8 700
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "9BF5EF" "0B1421"

  ; Hero heading
  ${NSD_CreateLabel} 12u 24u 280u 26u "Remove OSIEN Memories?"
  Pop $1
  CreateFont $2 "Segoe UI" 19 700
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F1F6FA" "0B1421"

  ; Reassuring subtitle
  ${NSD_CreateLabel} 12u 54u 280u 24u "Your imported memories are yours to keep. Only the desktop application will be removed."
  Pop $1
  CreateFont $2 "Segoe UI" 9.5 400
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "A5B3C0" "0B1421"

  ; What happens list
  ${NSD_CreateLabel} 12u 90u 280u 14u "•  Removes the OSIEN Memories app and shortcuts"
  Pop $1
  CreateFont $2 "Segoe UI" 9.5 600
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F1F6FA" "0B1421"

  ${NSD_CreateLabel} 12u 107u 280u 14u "•  Keeps all imported photos and videos untouched"
  Pop $1
  CreateFont $2 "Segoe UI" 9.5 600
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F1F6FA" "0B1421"

  ${NSD_CreateLabel} 12u 124u 280u 14u "•  Never modifies your iPhone media"
  Pop $1
  CreateFont $2 "Segoe UI" 9.5 600
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F1F6FA" "0B1421"

  ; Footer hint
  ${NSD_CreateLabel} 12u 156u 280u 16u "Click Next to remove OSIEN Memories from this PC."
  Pop $1
  CreateFont $2 "Segoe UI" 8.5 400
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "738393" "0B1421"

  nsDialogs::Show
FunctionEnd

Function un.MemoriesUninstallWelcomeLeave
FunctionEnd
!endif
