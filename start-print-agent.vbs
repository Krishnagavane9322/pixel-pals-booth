Set objShell = CreateObject("WScript.Shell")
objShell.Run "cmd /c start """" /min node """ & Replace(WScript.ScriptFullName, "start-print-agent.vbs", "print-agent.js") & """", 0, False
Set objShell = Nothing
