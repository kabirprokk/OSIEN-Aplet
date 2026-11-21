!define MUI_BGCOLOR "101214"
!define MUI_TEXTCOLOR "F5F7FA"
!define MUI_INSTFILESPAGE_COLORS "F5F7FA 101214"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_FINISHPAGE_TITLE "OSIEN Memories is ready"
!define MUI_FINISHPAGE_TEXT "Installation is complete. Your private media workspace is ready."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Launch OSIEN Memories"
!define MUI_FINISHPAGE_RUN_FUNCTION "LaunchMemories"
!define MUI_UNFINISHPAGE_TITLE "OSIEN Memories was removed"
!define MUI_UNFINISHPAGE_TEXT "The application has been removed. Your imported photos and videos have been left untouched."

!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
  Function LaunchMemories
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd
!endif

!macro customWelcomePage
  Page custom MemoriesWelcomeCreate MemoriesWelcomeLeave
!macroend

!macro customFinishPage
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  UninstPage custom un.MemoriesUninstallWelcomeCreate un.MemoriesUninstallWelcomeLeave
!macroend

Function MemoriesWelcomeCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 12u 100% 26u "Welcome to OSIEN Memories"
  Pop $1
  CreateFont $2 "Segoe UI" 18 700
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F5F7FA" "101214"
  ${NSD_CreateLabel} 0 48u 100% 28u "Bring your iPhone photos and videos into focus."
  Pop $1
  CreateFont $2 "Segoe UI" 11 400
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "00D9E8" "101214"
  ${NSD_CreateLabel} 0 91u 100% 54u "This setup will install OSIEN Memories on your PC.$\r$\n$\r$\nYour original iPhone media stays untouched."
  Pop $1
  CreateFont $2 "Segoe UI" 10 400
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "A1AAB2" "101214"
  nsDialogs::Show
FunctionEnd

Function MemoriesWelcomeLeave
FunctionEnd

Function un.MemoriesUninstallWelcomeCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 12u 100% 26u "Remove OSIEN Memories?"
  Pop $1
  CreateFont $2 "Segoe UI" 18 700
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "F5F7FA" "101214"
  ${NSD_CreateLabel} 0 48u 100% 28u "Your imported memories are yours to keep."
  Pop $1
  CreateFont $2 "Segoe UI" 11 400
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "00D9E8" "101214"
  ${NSD_CreateLabel} 0 91u 100% 54u "This removes the OSIEN Memories application.$\r$\n$\r$\nPhotos and videos already imported will not be deleted."
  Pop $1
  CreateFont $2 "Segoe UI" 10 400
  SendMessage $1 ${WM_SETFONT} $2 1
  SetCtlColors $1 "A1AAB2" "101214"
  nsDialogs::Show
FunctionEnd

Function un.MemoriesUninstallWelcomeLeave
FunctionEnd
