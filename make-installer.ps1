# make-installer.ps1 -- Compiles a 100% Genuine Native Windows .exe Installer for ROVI Photo Booth
$ErrorActionPreference = "Stop"

$distDir = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir -Force }

$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $cscPath)) {
    $cscPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

$csSource = @"
using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Drawing;

namespace ROVIPhotoBoothSetup {
    static class Program {
        [STAThread]
        static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Form form = new Form();
            form.Text = "ROVI AI Photo Booth Setup";
            form.Size = new Size(500, 320);
            form.StartPosition = FormStartPosition.CenterScreen;
            form.FormBorderStyle = FormBorderStyle.FixedDialog;
            form.MaximizeBox = false;
            form.MinimizeBox = false;
            form.BackColor = Color.FromArgb(15, 23, 42);

            Label title = new Label();
            title.Text = "ROVI AI Photo Booth Setup";
            title.Font = new Font("Segoe UI", 16, FontStyle.Bold);
            title.ForeColor = Color.FromArgb(56, 189, 248);
            title.Location = new Point(30, 25);
            title.AutoSize = true;
            form.Controls.Add(title);

            Label desc = new Label();
            desc.Text = "Click Install below to configure this laptop for ROVI Photo Booth kiosk operation & automatic DS-RX1 silent background printing.";
            desc.Font = new Font("Segoe UI", 10, FontStyle.Regular);
            desc.ForeColor = Color.FromArgb(226, 232, 240);
            desc.Location = new Point(30, 75);
            desc.Size = new Size(420, 60);
            form.Controls.Add(desc);

            Button btnInstall = new Button();
            btnInstall.Text = "Install Photo Booth";
            btnInstall.Font = new Font("Segoe UI", 11, FontStyle.Bold);
            btnInstall.BackColor = Color.FromArgb(14, 165, 233);
            btnInstall.ForeColor = Color.White;
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Location = new Point(30, 160);
            btnInstall.Size = new Size(200, 45);
            btnInstall.Cursor = Cursors.Hand;
            form.Controls.Add(btnInstall);

            Button btnClose = new Button();
            btnClose.Text = "Cancel";
            btnClose.Font = new Font("Segoe UI", 10);
            btnClose.BackColor = Color.FromArgb(51, 65, 85);
            btnClose.ForeColor = Color.White;
            btnClose.FlatStyle = FlatStyle.Flat;
            btnClose.FlatAppearance.BorderSize = 0;
            btnClose.Location = new Point(250, 160);
            btnClose.Size = new Size(120, 45);
            form.Controls.Add(btnClose);

            Label status = new Label();
            status.Text = "";
            status.Font = new Font("Segoe UI", 9, FontStyle.Italic);
            status.ForeColor = Color.FromArgb(74, 222, 128);
            status.Location = new Point(30, 225);
            status.Size = new Size(420, 30);
            form.Controls.Add(status);

            btnClose.Click += (s, e) => { form.Close(); };

            btnInstall.Click += (s, e) => {
                try {
                    btnInstall.Enabled = false;
                    status.Text = "Configuring background print engine & shortcuts...";
                    
                    // 1. Create Desktop Shortcut
                    string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                    string shortcut = Path.Combine(desktop, "ROVI Photo Booth.url");
                    File.WriteAllText(shortcut, "[InternetShortcut]\nURL=https://pixel-pals-booth.vercel.app\nIconIndex=0\nIconFile=C:\\Windows\\System32\\shell32.dll\n");

                    // 2. Add VBS launcher to Startup
                    string startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                    string vbsPath = Path.Combine(startup, "start-booth-silent.vbs");
                    string vbsCode = "Set WshShell = CreateObject(\"WScript.Shell\")\nWshShell.Run chr(34) & \"" + AppDomain.CurrentDomain.BaseDirectory.Replace("\\", "\\\\") + "start-booth.bat\" & chr(34), 0\nSet WshShell = Nothing";
                    File.WriteAllText(vbsPath, vbsCode);

                    status.Text = "Setup Complete! Desktop shortcut & startup service installed.";
                    MessageBox.Show("ROVI AI Photo Booth installed successfully!\n\nDesktop shortcut added & background print engine configured.", "Success", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    form.Close();
                } catch (Exception ex) {
                    MessageBox.Show("Setup error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    btnInstall.Enabled = true;
                }
            };

            Application.Run(form);
        }
    }
}
"@

$tmpCs = Join-Path $distDir "SetupSrc.cs"
Set-Content -Path $tmpCs -Value $csSource -Encoding UTF8

$outputExe = Join-Path $distDir "PhotoBooth-Setup.exe"
Remove-Item $outputExe -Force -ErrorAction SilentlyContinue

& $cscPath /target:winexe /out:"$outputExe" /r:System.Windows.Forms.dll /r:System.Drawing.dll "$tmpCs"

Remove-Item $tmpCs -Force -ErrorAction SilentlyContinue

Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Native Windows PhotoBooth-Setup.exe Compiled!  " -ForegroundColor Green
Write-Host "  Location: $outputExe" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
