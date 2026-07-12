# Accessing the My Tasco Knowledge Platform

This guide walks you through opening the My Tasco Knowledge Platform in your
web browser. No coding experience needed — just copy and paste the commands
shown below into a terminal window, one at a time.

The app lives on a private server (a GCP virtual machine), so instead of
visiting a public web address, you'll open a secure "tunnel" from your
computer to the server. Once the tunnel is running, the app behaves exactly
like any other website at `http://localhost:8080`.

> **Note:** These steps only need to be done once for setup (Steps 1–2). After
> that, you'll just repeat Step 3 whenever you want to use the app.

---

## What you'll need

- A Mac or Linux computer
- A terminal app (on Mac: **Terminal**, found in Applications → Utilities; on
  Linux: whatever terminal app your distro ships with)
- A Google account that has been granted access to the project (ask whoever
  invited you if you're not sure)
- About 10 minutes for first-time setup

---

## Step 1: Install the Google Cloud SDK (`gcloud`)

The Google Cloud SDK is a small program that lets your computer talk securely
to the GCP server. You only need to install it once.

1. Open your terminal.
2. Copy and paste this command, then press Enter:

   ```bash
   curl https://sdk.cloud.google.com | bash
   ```

3. When it asks `Do you want to continue? (Y/n)`, type `Y` and press Enter.
4. When it's done, close and reopen your terminal window (this makes sure the
   new `gcloud` command is available).
5. Confirm it installed correctly:

   ```bash
   gcloud --version
   ```

   You should see some version numbers printed out, like:

   ```
   Google Cloud SDK 500.0.0
   ...
   ```

   If instead you see `command not found: gcloud`, see
   [Troubleshooting](#troubleshooting) below.

> **Alternative for Mac users with Homebrew:** if you already use
> [Homebrew](https://brew.sh), you can instead run
> `brew install --cask google-cloud-sdk`.

---

## Step 2: Sign in with your Google account

This step connects the `gcloud` tool to your Google account so the server
knows who you are.

1. In your terminal, run:

   ```bash
   gcloud auth login
   ```

2. This opens a browser window (or prints a link to click) asking you to sign
   in to Google. Use the Google account that was given access to the My Tasco
   project.
3. Click **Allow** on the permissions screen.
4. Once you see "You are now authenticated" in the browser tab, you can close
   it and return to your terminal. You should see a message like:

   ```
   You are now logged in as [your-email@example.com].
   ```

5. Next, set the correct GCP project (ask your team lead for the project ID
   if you don't already have it):

   ```bash
   gcloud config set project <PROJECT_ID>
   ```

You only need to do Steps 1 and 2 **once** on your computer. Google will
remember you're signed in the next time you use `gcloud`.

---

## Step 3: Get the project files and open the tunnel

The tunnel command lives in the project's `justfile`, so you'll need a local
copy of the project repository and the `just` command runner installed.

### 3a. Install `just` (one-time setup)

- **Mac (with Homebrew):**

  ```bash
  brew install just
  ```

- **Linux:**

  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin
  ```

  (Make sure `~/.local/bin` is on your `PATH` — if `just --version` doesn't
  work afterward, add `export PATH="$HOME/.local/bin:$PATH"` to your
  `~/.zshrc` or `~/.bashrc` and reopen your terminal.)

Confirm it worked:

```bash
just --version
```

### 3b. Get the project repository

If you don't already have the project folder on your computer, ask a
teammate for the repository link and clone it, then move into the folder:

```bash
cd path/to/aabw-demo
```

### 3c. Run the tunnel

With the project folder open in your terminal, run:

```bash
just tunnel
```

You should see output like this:

```
Tunneling VM services to localhost:
  http://localhost:8080  → Caddy (web)
  http://localhost:8790  → Gateway API
  http://localhost:8888  → Hindsight API
  http://localhost:9999  → Hindsight UI
Press Ctrl+C to stop
```

**Leave this terminal window open** — the tunnel only works while this
command is running. Closing the window or pressing `Ctrl+C` disconnects it.

### 3d. Open the app

While the tunnel is running, open your web browser and go to:

```
http://localhost:8080
```

You should see the My Tasco Knowledge Platform login screen. That's it —
you're in!

When you're done using the app, go back to the terminal window running the
tunnel and press `Ctrl+C` to close the connection.

---

## Quick reference (after first-time setup)

Every time you want to use the app:

1. Open a terminal.
2. `cd` into the project folder.
3. Run `just tunnel`.
4. Open `http://localhost:8080` in your browser.
5. When finished, press `Ctrl+C` in the terminal.

---

## Troubleshooting

### "command not found: gcloud"

The SDK installed but your terminal doesn't know where to find it yet.

- Close and fully reopen your terminal app, then try `gcloud --version` again.
- If that doesn't work, run `source ~/.bashrc` (Linux) or
  `source ~/.zshrc` (Mac) and try again.
- As a last resort, reinstall following [Step 1](#step-1-install-the-google-cloud-sdk-gcloud) and watch for any error messages during install.

### "command not found: just"

Same idea as above — reopen your terminal, or make sure the install
directory (`~/.local/bin` on Linux, or your Homebrew bin folder on Mac) is on
your `PATH`.

### "Permission denied" or "You do not have permission to access..."

This means your Google account hasn't been given access to the GCP project
or the VM yet.

- Double check you signed in with the correct Google account:
  ```bash
  gcloud auth list
  ```
  The account with `(active)` next to it should be the one your team lead
  granted access to. If it's the wrong one, run `gcloud auth login` again and
  sign in with the correct account.
- Confirm the project is set correctly:
  ```bash
  gcloud config get-value project
  ```
- If both look right and you still get "Permission denied," ask your team
  lead to confirm your account has been added to the project (it needs the
  "Compute OS Login" or "Compute Instance Admin" role, or an SSH key on the
  instance).

### "Permission denied (publickey)" when tunneling

This usually means `gcloud` hasn't generated an SSH key for you yet, or it
failed to upload it to the VM. Try running:

```bash
gcloud compute ssh mytasco-vm-14c2caa --zone=us-central1-a
```

directly (this is the same thing `just ssh` does). The first time you run
this, `gcloud` will offer to generate an SSH key pair for you — say yes. Once
you can SSH in successfully, exit (`exit` or `Ctrl+D`) and try `just tunnel`
again.

### The tunnel command just hangs with no output, or `http://localhost:8080` won't load

- Make sure the tunnel terminal window is still open and hasn't shown an
  error. It's normal for it to show only the banner text and then sit there
  quietly — that means it's working.
- Try refreshing the browser tab, or opening the URL in a new tab/incognito
  window.
- Make sure nothing else on your computer is already using port `8080`. If
  another app is using it, you'll see an error like `bind: address already in
  use` when you run `just tunnel`. Close the other app, or ask a teammate for
  help remapping the port.
- If the page loads but looks broken or shows a connection error, the VM's
  services may be down. Ask a teammate with server access to check
  `just vm-logs` (this tails the live application logs on the server).

### "Could not fetch resource" / spinning forever after login

The tunnel connects your browser to the server, but if your internet
connection drops, the tunnel silently stops working. Press `Ctrl+C` in the
tunnel terminal window and run `just tunnel` again.

### I don't know the project ID or which Google account to use

Ask your team lead or whoever gave you access to the platform — they'll have
the project ID and can confirm which Google account was added.

---

## Getting more help

If you've worked through the troubleshooting steps above and are still
stuck, reach out to your team lead with:

1. The exact command you ran.
2. The exact error message you saw (copy-paste it, screenshots also work).
3. The output of `gcloud auth list` and `gcloud config get-value project`.

This will help them diagnose the issue quickly.
