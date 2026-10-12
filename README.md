# INCENTIFY EMS V21.0.0 — GitHub Frontend

V21 makes employee facial registration an Admin-controlled capability inside the authenticated Employee Portal.

## Face workflow
1. Admin selects an employee.
2. Admin clicks **Enable face capture**.
3. Employee Portal detects the server-side ON state.
4. Employee clicks **Capture & verify face**.
5. The camera captures five quality-checked samples with no location request.
6. The averaged face descriptor is stored securely through the V21 Apps Script API.
7. Face Capture Access automatically returns to OFF after a successful registration.
8. Verified employee details are emailed to the employee and configured Admin copy. The biometric descriptor is never emailed.
9. Admin can enable capture again later to replace/update the face.

Legacy enrollment-link capture is disabled. Attendance links still use office location + the stored face profile for attendance IN.

## Local verification
```powershell
node .\scripts\verify-v21.mjs
node .\scripts\test-api-client-v21.mjs
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\test-v21-deployment.ps1
.\scripts\test-v21-backend.ps1
```

## Deployment
Source folder:
`C:\Users\MYPC\Desktop\Incentify_EMS\INCENTIFY_EMS_V21_GitHub_Frontend`

Git deployment clone remains under:
`C:\Users\MYPC\Desktop\Incentify_EMS\Deployment_Folder`

Run `scripts\deploy-v21-to-git.ps1` to Robocopy the verified frontend into the existing Git clone while preserving `.git`.
