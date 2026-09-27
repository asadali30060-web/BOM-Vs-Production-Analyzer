# Gatronova - BOM & Production Workspace

This guide explains how to download and run the app on a Windows computer. You do not need programming experience.

The app lets an administrator upload Excel production reports and BOMs, then select which BOM to use. A second account can view the uploaded report list and saved selections.

**Current status:** uploading and BOM selection work. Analysis calculations are not available yet. Seeing **Analysis rules pending configuration** is expected.

## 1. Install Node.js once

Node.js is the program that runs this app on your computer.

1. Open the [official Node.js download page](https://nodejs.org/en/download).
2. Choose the **LTS** version for **Windows**, then download the **Windows Installer (.msi)**.
3. Open the downloaded installer and follow its steps, keeping the default settings.
4. After installation, close any open Command Prompt or PowerShell windows. You will open a new one below.

The app requires Node.js version **22.13 or newer**. The LTS installer is the recommended choice.

You will also need a web browser, such as Microsoft Edge or Google Chrome. Internet access is needed for the initial downloads; the app can then run locally without an internet connection.

## 2. Download the project from GitHub

1. Open the [Gatronova project on GitHub](https://github.com/asadali30060-web/BOM-Vs-Production-Analyzer).
2. Click the green **Code** button above the file list.
3. Click **Download ZIP**. This method does not require installing Git. See [GitHub's download instructions](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives) if needed.
4. Find the downloaded ZIP file in your **Downloads** folder.
5. Right-click it and choose **Extract All**, then **Extract**.
6. Open the extracted folder. Keep opening the folder inside it until you see **package.json**, **README.md**, **src** and **public** together. This is the **project folder**.
7. Move this project folder to a permanent location, such as your **Documents** folder. Keep using this same copy so your accounts and saved analysis reports stay together.

If GitHub shows **404 / Page not found**, sign in to your GitHub account. For a private repository, the owner must give that account access first. Your GitHub login is separate from the app's `admin` and `secondary` accounts.

**Do not run the app from inside the ZIP file. Extract it first.**

## 3. Start the app

1. Open the project folder in Windows File Explorer.
2. Click the **address bar at the top** that shows the folder location. This is not the search box.
3. Type `cmd` and press **Enter**. A Command Prompt window opens in the project folder.
4. Type the following and press **Enter**:

   ```bat
   node --version
   ```

   You should see a version number, such as `v24.x.x`.

5. Type this command and press **Enter**:

   ```bat
   node src/server.js
   ```

6. Wait for this message:

   ```text
   Gatronova is running at http://localhost:3000
   ```

7. Open your browser and enter **http://localhost:3000** in its address bar.

**Keep the Command Prompt window open while using the app.** You can minimize it. It is normal for the window to stay on the running message.

There are no additional packages to install and no database to set up. Do not double-click `public/index.html`; use the browser address above after starting the app.

## 4. Set up the two accounts on first use

A fresh download does not include someone else's passwords or uploaded reports.

1. On the welcome page, click **Set up accounts**.
2. Enter a password for **admin** and a different password for **secondary**. Each must contain 8 to 128 characters.
3. Keep both passwords somewhere safe.
4. Click **Save accounts & sign in**. You will enter the app as admin.

| Username to enter | What this account can do |
| --- | --- |
| `admin` | Upload BOMs and production reports, select a BOM, and view saved analysis reports. |
| `secondary` | View session uploads, BOMs, selections, and saved analysis reports. Cannot upload or change anything. |

The usernames are exactly `admin` and `secondary`. Neither account needs an email address.

Setup is shown only once for that copy of the app. On later visits, click **Sign in** and enter the username and the password you set. The sign-out button is beside the account name at the bottom of the left sidebar.

Both accounts use the same workspace on this computer. Signing out of either account ends the shared session for both users. Original files on your computer are never deleted. A separate download on another computer has its own saved data; copies do not synchronize automatically.

## 5. Upload your local files and choose a BOM

BOM files are **not included in GitHub**. Keep the originals on your own computer. Sign in as **admin**, then:

1. Click **Upload & select** in the left menu.
2. Click the production-report upload area and choose your Excel report, for example **COOIS Report Ready.xlsx**.
3. Wait for **Report uploaded successfully**.
4. In the **BOM 1** card, click **Upload Excel file** and choose your first BOM from your computer.
5. In the **BOM 2** card, upload your second BOM if you need it. You only need to upload the BOM you intend to select.
6. Click **Select this BOM** under the uploaded BOM you want to use.
7. The app shows the production report and selected BOM together.

Every workbook must be an actual **.xlsx** file, no larger than **10 MB**. `.xls`, CSV, PDF, and password-protected files are not supported. You can upload the BOMs before or after the production report.

Replacing a BOM clears report selections that referred to its previous file. Select the replacement explicitly to continue.

**The Run analyzer button is disabled until the calculation rules are added.** This is not an error. No analysis results are generated in this version.

### What stays and what is cleared

| Information | After sign-out or restarting the app |
| --- | --- |
| Account usernames and passwords | Kept |
| Previously saved analysis outputs | Kept; view through **Analysis reports** after signing in |
| Uploaded BOM files | Cleared; upload again for a new session |
| Uploaded production reports | Cleared; upload again for a new session |
| Report-to-BOM selections | Cleared |
| Original Excel files on your computer | Unchanged |

**Signing out of either account clears the shared uploaded files and signs both users out.** The secondary user can inspect temporary uploads while that shared session is active. Closing only a browser tab does not end the session; use the sign-out button when finished.

**Session uploads** lists production reports uploaded during the current session. **Open** shows the report details and selected BOM, not the Excel worksheet contents.

### View saved analysis reports later

The **Analysis reports** page reads completed outputs from local storage. These records are kept independently of session uploads and account sign-out. Both users can view them.

For a saved output, **Download report** creates an HTML file. Open it in a browser on another computer to view it without the app, original Excel files, or an internet connection. Keep that downloaded file wherever you need it. There is no hosting or automatic synchronization between computers.

**At present this page is empty on a new installation.** The viewer, download option, and retention behavior are prepared, but generation of real outputs must be connected when the analyzer rules are supplied. No example results are presented as real analysis.

## 6. Stop the app and open it another day

To stop:

1. Return to the Command Prompt window running the app.
2. Press **Ctrl + C**. You can then close the window.

Closing only the browser does not stop the app.

To start again:

1. Open the **same project folder**.
2. Type `cmd` in the File Explorer address bar and press Enter.
3. Run `node src/server.js`.
4. Open **http://localhost:3000** and sign in.

Accounts and saved analysis outputs are retained. Restarting clears the uploaded BOMs, production files, and temporary selections. Sign in and upload your local workbooks again for a new session.

## 7. Back up your work or install an updated copy

The app creates a folder named **data** inside the project folder. It contains account records and any saved analysis outputs. Uploaded Excel files are held only in memory for the shared session.

### Make a backup

1. Stop the app with **Ctrl + C**.
2. Copy the entire **data** folder to your approved backup location, outside the project folder.
3. Keep the backup private because it contains account information and saved analysis outputs.

Do not edit or delete files inside `data` by hand. In particular, `data/workspace.json` stores the account and saved analysis-report records.

### Use a newer project download or move to another computer

1. Stop the existing app and back up **data** first.
2. Download and extract the new project into a separate folder, following step 2 above.
3. Copy your backed-up **data** folder into the new project folder, next to **package.json**, before starting it.
4. If a `data` folder already exists there, back it up separately before replacing it. Do not merge two different workspaces.
5. Start the new copy and check your accounts and saved analysis reports before removing the old copy.

GitHub does **not** back up local accounts, analysis outputs, BOMs, or production workbooks. The `data` folder and Excel files are excluded from Git. Keep your original Excel files and downloaded analysis outputs in your own backup location.

## Common problems

| What you see | What to do |
| --- | --- |
| `node is not recognized` | Install Node.js using step 1. Close the Command Prompt and open a new one. If it still fails, restart Windows and try again. |
| `Cannot find module ...src/server.js` | You opened Command Prompt in the wrong folder. Open the folder containing `package.json` and `src`, then follow step 3 again. |
| Browser says `This site can't be reached` | Check that the app's Command Prompt window is still open and shows the running message. Use `http://localhost:3000`, with `http` rather than `https`. |
| `EADDRINUSE` or `address already in use` | Another app instance may already be running. Try opening `http://localhost:3000`. If it is Gatronova, use that instance or stop its Command Prompt with Ctrl + C before starting another. |
| `Incorrect username or password` | Enter `admin` or `secondary`, and the password set for that account. Check Caps Lock. Password recovery is not available in the interface yet; request a reset from the project maintainer if needed. Do not delete `data` to reset a password. |
| No upload or selection buttons | You are signed in as `secondary`. Sign out and use `admin` to make changes. |
| Upload is rejected | Check that the file is an actual Excel `.xlsx` workbook, under 10 MB, and not password-protected. Renaming another file to `.xlsx` does not convert it. |
| A BOM says **Upload required** | Sign in as admin and upload its Excel file from your computer. BOMs must be uploaded again after sign-out or a restart. |
| Setup appears again or saved analysis outputs seem missing | Use the same project folder and its original `data` folder. Temporary uploaded files disappearing after sign-out is expected. |
| `Analysis rules pending configuration` | Expected in this version. Uploading and BOM selection are available; calculations are not yet implemented. |

If another program needs port 3000, use these two commands in **Command Prompt** from the project folder:

```bat
set PORT=3001
node src/server.js
```

Then open **http://localhost:3001**. Use the address printed by the running app.

## Technical reference (optional)

You can skip this section for normal use.

```text
src/
  server.js              Server, login, permissions, and report routes
  bom-catalog.js         The two empty BOM upload slots
  uploads.js             Excel file validation
public/
  index.html             Web page
  css/style.css          Appearance
  js/app.js              Browser interactions
tests/
  workflow.test.js       Automated checks
  workbook-fixture.js    Generated test workbook; no company data
data/                    Accounts and saved outputs; excluded from Git
package.json             Project settings and commands
README.md                This guide
.gitignore               Files excluded from Git
```

The app uses JavaScript, Node.js, HTML, and CSS, with local file storage and no database. `npm start` is an alternative to `node src/server.js`. Run `node --test` or `npm test` for automated checks; they use temporary storage, not your account data.

If Git is already installed, this is an alternative to Download ZIP. Run these commands from the folder where you want to keep the project:

```bat
git clone https://github.com/asadali30060-web/BOM-Vs-Production-Analyzer.git
cd BOM-Vs-Production-Analyzer
node src/server.js
```

Use one running server process for each data folder. Sessions, uploaded workbook bytes, and temporary selections are stored in memory. Saved output records (`analysisReports`) and salted password hashes remain in `data/workspace.json`. Existing saved outputs can be read and downloaded; the analysis endpoint is disabled until analyzer rules are supplied. On upgrade, legacy production-upload records and files are cleared while credentials and saved output records are retained. Upload checks validate package structure without interpreting formulas or business rules. Analysis, password recovery, and BOM versioning are not implemented.
