' ============================================================
'  Sentinel AI — to'xtatish (fon serverini o'chirish)
'  Odatda kerak emas — dastur fonda ishlab tursa ham zarari yo'q.
'  Faqat butunlay to'xtatmoqchi bo'lsangiz ishlating.
' ============================================================
Option Explicit
Dim sh, ans
Set sh = CreateObject("WScript.Shell")
ans = MsgBox("Sentinel AI serverini to'xtatilsinmi?", 4 + 32, "Sentinel AI")
If ans = 6 Then
  sh.Run "cmd /c taskkill /f /im node.exe", 0, True
  MsgBox "Sentinel AI to'xtatildi.", 64, "Sentinel AI"
End If
