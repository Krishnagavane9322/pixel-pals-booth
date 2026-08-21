; Inno Setup Compiler Script for ROVI AI Photo Booth
; Generates PhotoBooth-Setup.exe for non-technical client distribution

#define MyAppName "ROVI AI Photo Booth"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ROVI AI Technologies"
#define MyAppURL "https://pixel-pals-booth.vercel.app"
#define MyAppExeName "ROVI Photo Booth.url"

[Setup]
AppId={{D8A1E9A4-279A-4E38-9B21-0B6B54E8B0D3}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=PhotoBooth-Setup
OutputDir=dist
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; ExcludePattern: "node_modules,.git,.output,.tanstack,dist"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{#MyAppURL}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{#MyAppURL}"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Start-Process node -ArgumentList 'service-install.js' -WorkingDirectory '{app}' -Verb RunAs"""; StatusMsg: "Configuring ROVI Background Print Engine Windows Service..."; Flags: runhidden

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Start-Process node -ArgumentList 'service-uninstall.js' -WorkingDirectory '{app}' -Verb RunAs"""; StatusMsg: "Stopping ROVI Background Print Engine..."; Flags: runhidden
