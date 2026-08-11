' ============================================================
'  Sentinel AI — Kamera (NVR) parolini o'zgartirish
'  NVR admin parolini yangilagan bo'lsangiz, yangi parolni shu yerda kiriting.
'  Dastur kameralarga shu yangi parol bilan ulanadi.
' ============================================================
Option Explicit
Dim fso, sh, dir, pw
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir

pw = InputBox("Kameralarning (NVR) YANGI admin parolini kiriting:" & vbCrLf & _
              "(NVR menyusida o'zingiz qo'ygan yangi parol)", "Kamera paroli")
If Trim(pw) = "" Then WScript.Quit

' Ishlayotgan serverni to'xtatamiz
sh.Run "cmd /c taskkill /f /im node.exe", 0, True
' Yangi parolni cameras.json ga yozamiz
sh.Run "cmd /c node server\set-nvr-pass.js """ & pw & """", 0, True
' Dasturni qayta ishga tushiramiz
sh.Run """" & dir & "\Sentinel.vbs""", 0, False

MsgBox "Kamera paroli yangilandi va dastur qayta ishga tushdi." & vbCrLf & _
       "Bir necha soniyada kameralar ko'rinadi.", 64, "Sentinel AI"
