@echo off
cd /d d:\build\GitLocal\MC-web
echo Starting MC-web server...
echo.
echo Visit: http://localhost:8080
echo Press Ctrl+C to stop the server
echo.
C:\Users\Doulor\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe -c "C:\Users\Doulor\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.ini" -S localhost:8080 -t d:\build\GitLocal\MC-web
pause