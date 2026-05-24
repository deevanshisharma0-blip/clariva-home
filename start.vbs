Set fso = CreateObject("Scripting.FileSystemObject")
Set ws  = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ws.CurrentDirectory = dir
ws.Run """C:\Users\deeva\AppData\Local\Programs\Python\Python312\pythonw.exe"" apps\desktop\main.py", 0, False
