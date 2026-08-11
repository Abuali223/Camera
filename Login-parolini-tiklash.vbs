' ============================================================
'  Sentinel AI — Dastur login parolini tiklash (unutgan bo'lsangiz)
'  Bu faqat DASTURGA kirish parolini tiklaydi (kamera paroliga aloqasi yo'q).
'  Tiklangach, dastur keyingi ochilishда yangi parol o'rnatishни so'raydi.
' ============================================================
Option Explicit
Dim fso, sh, dir, ans, authf
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)

ans = MsgBox("Dastur login parolini tiklaymizmi?" & vbCrLf & vbCrLf & _
             "Keyingi ochilishда YANGI parol o'rnatasiz." & vbCrLf & _
             "(Kamera paroliga ta'sir qilmaydi.)", 4 + 48, "Sentinel AI — parolni tiklash")
If ans <> 6 Then WScript.Quit

' Serverni to'xtatamiz (xotiradagi eski parol o'chsin)
sh.Run "cmd /c taskkill /f /im node.exe", 0, True

' auth.json ni o'chiramiz — dastur "parol o'rnatilmagan" holatga qaytadi
authf = dir & "\server\auth.json"
If fso.FileExists(authf) Then fso.DeleteFile(authf)

' Dasturni qayta ishga tushiramiz
sh.Run """" & dir & "\Sentinel.vbs""", 0, False

MsgBox "Login paroli tiklandi." & vbCrLf & _
       "Dastur ochilganда 'Parol o'rnating' oynasi chiqadi — yangi parol kiriting.", 64, "Sentinel AI"
