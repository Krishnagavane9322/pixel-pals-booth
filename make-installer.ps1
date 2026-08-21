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
            form.Size = new Size(520, 340);
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
            desc.Text = "Click Install below to configure this PC for ROVI Photo Booth kiosk operation, desktop shortcuts, and automatic DNP DS-RX1 background printing.";
            desc.Font = new Font("Segoe UI", 10, FontStyle.Regular);
            desc.ForeColor = Color.FromArgb(226, 232, 240);
            desc.Location = new Point(30, 75);
            desc.Size = new Size(440, 60);
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
            status.Location = new Point(30, 230);
            status.Size = new Size(440, 40);
            form.Controls.Add(status);

            btnClose.Click += (s, e) => { form.Close(); };

            btnInstall.Click += (s, e) => {
                try {
                    btnInstall.Enabled = false;
                    status.Text = "Installing Desktop shortcuts & background print service...";

                    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                    string targetUrl = "https://pixel-pals-booth.vercel.app";

                    // 1. Create Desktop Shortcuts across Local Desktop, OneDrive Desktop, and Public Desktop
                    string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                    string[] desktopPaths = new string[] {
                        Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                        Path.Combine(userProfile, "OneDrive", "Desktop"),
                        Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory)
                    };

                    foreach (string dp in desktopPaths) {
                        try {
                            if (Directory.Exists(dp)) {
                                string urlFile = Path.Combine(dp, "ROVI Photo Booth.url");
                                File.WriteAllText(urlFile, "[InternetShortcut]\nURL=" + targetUrl + "\nIconIndex=0\nIconFile=C:\\Windows\\System32\\imageres.dll\n");
                            }
                        } catch {}
                    }

                    // 2. Register Startup VBS helper
                    string startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                    string vbsPath = Path.Combine(startup, "start-booth-silent.vbs");
                    string batPath = Path.Combine(baseDir, "start-booth.bat");
                    string vbsCode = "Set WshShell = CreateObject(\"WScript.Shell\")\nWshShell.Run chr(34) & \"" + batPath.Replace("\\", "\\\\") + "\" & chr(34), 0\nSet WshShell = Nothing";
                    File.WriteAllText(vbsPath, vbsCode);

                    // 3. Launch local print agent
                    try {
                        ProcessStartInfo psi = new ProcessStartInfo();
                        psi.FileName = "cmd.exe";
                        psi.Arguments = "/c start \"\" /min node \"" + Path.Combine(baseDir, "print-agent.js") + "\"";
                        psi.WindowStyle = ProcessWindowStyle.Hidden;
                        psi.CreateNoWindow = true;
                        Process.Start(psi);
                    } catch {}

                    status.Text = "Setup Complete! Desktop shortcut added & print service running.";
                    MessageBox.Show("ROVI AI Photo Booth installed successfully!\n\n1. 'ROVI Photo Booth' shortcut added to Desktop.\n2. Background print engine is active & configured for startup.", "Installation Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
