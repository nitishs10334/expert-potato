# Deploying to GitHub Pages

This guide will get the portal live on the internet in under 5 minutes so your friends can access it from any browser, anywhere — no installation required.

---

## Step 1: Create a GitHub Account (if you don't have one)
Go to https://github.com and sign up for a free account.

---

## Step 2: Create a New Repository
1. Click the **+** button at the top right of GitHub → **New repository**.
2. Give it a name (e.g. `iisc-aa-mock-portal`).
3. Set it to **Public** (required for free GitHub Pages).
4. Do **not** tick "Initialize this repository with a README".
5. Click **Create repository**.

---

## Step 3: Upload Your Files
1. On the empty repository page, click **uploading an existing file**.
2. Drag and drop the **entire contents** of the `Admin Ass` folder into the upload area.
   - Make sure you include `index.html`, `assets/`, and `papers/`.
   - You do NOT need to upload `Start_Portal.bat`, `verify_json.py`, `2023/`, or `2026/` — those are local tools only.
3. Click **Commit changes**.

---

## Step 4: Enable GitHub Pages
1. In your repository, click **Settings** (top tab bar).
2. In the left sidebar, click **Pages**.
3. Under **Source**, select **Deploy from a branch**.
4. Set **Branch** to `main` and folder to `/ (root)`.
5. Click **Save**.

---

## Step 5: Get Your Live URL
After about 1-2 minutes, GitHub Pages will give you a live URL like:
```
https://your-username.github.io/iisc-aa-mock-portal/
```
Share this link with your friends. That is all they need — no installation, no Python, no setup.

---

## How Privacy Works
- The portal stores all attempts and progress inside each person's **own browser** (called `localStorage`).
- When someone opens the portal, they enter a **username of their choice**. Their data is stored under that username key.
- Nobody can see anyone else's attempts because they are stored locally in each person's browser, not on a server.
- Two people on the same physical computer can use different usernames to keep their attempts separate.

---

## Adding New Papers Later
1. Add the new `.json` file to the `papers/` folder in your GitHub repository.
2. Update `papers/manifest.json` to include the new filename.
3. Commit the changes.
4. After a minute, the paper will appear automatically on everyone's portal when they refresh.
