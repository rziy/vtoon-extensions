' Menjalankan bridge di background (tanpa jendela terminal).
' Log tersimpan di bridge\bridge.log
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir & "\bridge"
sh.Run "cmd /c node server.js --voratoon-bridge > bridge.log 2>&1", 0, False
