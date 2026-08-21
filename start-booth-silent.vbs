Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & WshShell.CurrentDirectory & "\start-booth.bat" & chr(34), 0
Set WshShell = Nothing
