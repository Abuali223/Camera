' ============================================================
'  Sentinel AI — terminalsiz (oynasiz) ishga tushirish
'  Ish stolidagi yorliqni ikki marta bosish kifoya.
'  Hech qanday qora terminal oynasi ochilmaydi.
' ============================================================
Option Explicit
Dim fso, sh, dir, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

' Ushbu fayl joylashgan papka (dastur papkasi)
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir

' Server o'zi brauzer ochmasin — buni quyida biz o'zimiz qilamiz (ikki marta ochilmasin)
sh.Environment("PROCESS")("NO_OPEN") = "1"

' 1) Birinchi marta ishga tushirilsa — kerakli kutubxonalarni o'rnatamiz (yashirin, tugaguncha kutamiz)
If Not fso.FolderExists(dir & "\node_modules") Then
  sh.Run "cmd /c npm install", 0, True
End If

' 2) Server allaqachon ishlayaptimi? Yo'q bo'lsa — yashirin (oynasiz) ishga tushiramiz.
If Not ServerUp() Then
  sh.Run "cmd /c node server\index.js", 0, False
End If

' 3) Server tayyor bo'lguncha kutamiz (eng ko'pi 30 soniya)
For i = 1 To 60
  If ServerUp() Then Exit For
  WScript.Sleep 500
Next

' 4) Brauzerda ochamiz
sh.Run "http://localhost:8080"

' --- server ishlab turibmi? (localhost:8080 javob beryaptimi) ---
Function ServerUp()
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", "http://localhost:8080/api/status", False
  http.Send
  ServerUp = (Err.Number = 0 And http.Status = 200)
  On Error GoTo 0
End Function
