' ============================================================
'  Sentinel AI — ish stoliga yorliq chiqarish
'  Bu faylni BIR MARTA ikki marta bosing — ish stolida
'  "Sentinel AI" yorlig'i (kamera ikonkasi bilan) paydo bo'ladi.
'  Keyin har doim o'sha yorliqdan dasturni ochasiz.
' ============================================================
Option Explicit
Dim fso, sh, dir, desktop, lnk, icon

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

dir     = fso.GetParentFolderName(WScript.ScriptFullName)
desktop = sh.SpecialFolders("Desktop")

' Ikonka (dastur ichidagi favicon.ico) — bo'lmasa Windows ikonkasidan foydalanamiz
icon = dir & "\public\favicon.ico"
If Not fso.FileExists(icon) Then icon = "shell32.dll, 18"

Set lnk = sh.CreateShortcut(desktop & "\Sentinel AI.lnk")
lnk.TargetPath        = dir & "\Sentinel.vbs"
lnk.WorkingDirectory  = dir
lnk.Description        = "Sentinel AI — kamera nazorat tizimi"
lnk.IconLocation       = icon
lnk.WindowStyle        = 7   ' minimallashtirilgan (baribir vbs oynasi yo'q)
lnk.Save

MsgBox "Tayyor! Ish stolida 'Sentinel AI' yorlig'i paydo bo'ldi." & vbCrLf & _
       "Endi o'sha yorliqni bosib dasturni oching.", 64, "Sentinel AI"
