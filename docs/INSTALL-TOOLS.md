# Installing `just` and `gcloud`

This repo uses [`just`](https://github.com/casey/just) as its command runner (see
[`JUSTFILE-REFERENCE.md`](./JUSTFILE-REFERENCE.md)) and the [Google Cloud SDK](https://cloud.google.com/sdk)
(`gcloud`) for deployment. This guide gets both installed on macOS, Linux, and Windows.

---

## 1. Quick Install

Pick your OS, paste the block, done. Each block installs **both** tools.

### macOS

```bash
brew install just
brew install --cask google-cloud-sdk
exec $SHELL   # reload shell so gcloud's PATH additions take effect
```

### Linux — Ubuntu / Debian

```bash
# just
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin

# gcloud
curl -sSL https://sdk.cloud.google.com | bash
exec -l $SHELL   # reload shell so PATH additions take effect
gcloud init
```

### Linux — Fedora / RHEL

```bash
# just
sudo dnf install -y just

# gcloud
sudo tee /etc/yum.repos.d/google-cloud-sdk.repo <<EOF
[google-cloud-cli]
name=Google Cloud CLI
baseurl=https://packages.cloud.google.com/yum/repos/cloud-sdk-el8-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF
sudo dnf install -y google-cloud-cli
```

### Linux — Arch

```bash
sudo pacman -S --noconfirm just google-cloud-cli
```

### Windows (PowerShell, winget)

```powershell
winget install --id Casey.Just -e
winget install --id Google.CloudSDK -e
# Close and reopen your terminal so PATH updates take effect
```

Verify both, on any platform:

```bash
just --version
gcloud --version
```

If either command is "not found," restart your shell/terminal first — that fixes the vast
majority of post-install issues (see [Troubleshooting](#4-troubleshooting)).

---

## 2. Detailed Instructions per Platform

### 2.1 macOS

#### `just`

| Method | Command | Notes |
|---|---|---|
| **Homebrew (preferred)** | `brew install just` | Installs to `$(brew --prefix)/bin`, already on `PATH` if Homebrew is set up |
| Cargo | `cargo install just` | Requires Rust toolchain; installs to `~/.cargo/bin` |
| Install script | `curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh \| bash -s -- --to ~/.local/bin` | Add `~/.local/bin` to `PATH` if not already there |
| MacPorts | `sudo port install just` | Alternative to Homebrew |

Verify:

```bash
just --version
# just 1.x.x
```

Gotchas:
- Apple Silicon Homebrew lives at `/opt/homebrew/bin`; Intel Homebrew at `/usr/local/bin`. If
  `just` isn't found after install, confirm `brew --prefix` is on your `PATH` (`echo $PATH`).
- New shell sessions pick up `brew shellenv` automatically only if it's in your `~/.zprofile` —
  Homebrew's own installer adds this, but if you installed Homebrew a long time ago, check.

#### `gcloud`

| Method | Command | Notes |
|---|---|---|
| **Homebrew cask (preferred)** | `brew install --cask google-cloud-sdk` | Installs to `/opt/homebrew/Caskroom` (Apple Silicon) or `/usr/local/Caskroom` (Intel) |
| Official interactive installer | `curl https://sdk.cloud.google.com \| bash` | Prompts to modify `~/.zshrc`/`~/.bash_profile` for you |
| Manual archive | Download the `.tar.gz` for macOS from https://cloud.google.com/sdk/docs/install, extract, run `./google-cloud-sdk/install.sh` | Use when you need a specific version or an offline install |

Verify:

```bash
gcloud --version
gcloud auth login   # opens a browser to authenticate
```

Gotchas:
- After `brew install --cask google-cloud-sdk`, `gcloud` is **not** auto-added to `PATH` on all
  setups. If not found, add to your shell rc file:
  ```bash
  source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"
  source "$(brew --prefix)/share/google-cloud-sdk/completion.zsh.inc"
  ```
- Always `exec $SHELL` (or open a new terminal tab) after install — the installer edits rc files
  that only apply to new shells.
- Run `gcloud init` once after install to set your default project/region; the `gateway` service
  in this repo expects `gcloud auth application-default login` if it calls GCP APIs locally.

---

### 2.2 Linux

#### Ubuntu / Debian

**`just`**

| Method | Command | Notes |
|---|---|---|
| **apt (preferred, Ubuntu 24.04+/Debian 13+)** | `sudo apt install just` | Older releases ship a stale or missing version — check with `apt-cache policy just` first |
| Install script (preferred for older releases) | `curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh \| bash -s -- --to ~/.local/bin` | Always gets the latest release |
| Cargo | `cargo install just` | Requires `rustc`/`cargo` |
| Snap | `sudo snap install --edge --classic just` | Community-maintained |

Verify:

```bash
just --version
```

**`gcloud`**

| Method | Command | Notes |
|---|---|---|
| **apt repo (preferred)** | see block below | Keeps `gcloud` updatable via `apt upgrade` |
| Interactive installer | `curl https://sdk.cloud.google.com \| bash` | Simplest, self-contained, updates via `gcloud components update` |

Add the apt repo:

```bash
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates gnupg curl

curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg

echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | \
  sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

sudo apt-get update && sudo apt-get install -y google-cloud-cli
```

Verify:

```bash
gcloud --version
gcloud auth login
```

Gotchas:
- `~/.local/bin` is only on `PATH` by default on Ubuntu if it exists at login time. If the
  install script created it fresh, log out/in or run `export PATH="$HOME/.local/bin:$PATH"`.
- WSL2 users: run the standard Debian/Ubuntu instructions above; browser-based `gcloud auth
  login` will spawn a URL for you to open manually if no browser handoff is configured.

#### Fedora / RHEL / CentOS Stream

**`just`**

```bash
sudo dnf install -y just          # Fedora 38+ ships it in the default repos
```

Alternative: the install script (same as above) or `cargo install just`.

**`gcloud`**

```bash
sudo tee /etc/yum.repos.d/google-cloud-sdk.repo <<EOF
[google-cloud-cli]
name=Google Cloud CLI
baseurl=https://packages.cloud.google.com/yum/repos/cloud-sdk-el8-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF

sudo dnf install -y google-cloud-cli
```

Verify:

```bash
just --version
gcloud --version
```

Gotchas:
- RHEL/CentOS may need `sudo dnf install -y dnf-plugins-core` before the repo config works.
- SELinux-enforcing hosts occasionally block the installer's temp scripts; if `dnf install` hangs
  or errors oddly, check `sudo ausearch -m avc -ts recent`.

#### Arch Linux

```bash
sudo pacman -S --noconfirm just google-cloud-cli
```

Both are in the `extra` repo — no AUR helper needed. If `google-cloud-cli` isn't found, sync
mirrors first: `sudo pacman -Syu`.

AUR alternative (rarely needed): `yay -S google-cloud-cli-bin` for a faster-installing prebuilt.

Verify:

```bash
just --version
gcloud --version
```

Gotchas:
- Arch's `google-cloud-cli` package doesn't auto-run `gcloud init`; run it manually after install.
- If you use a minimal shell (no `bash-completion` installed), `gcloud`'s completion script
  install step may print a harmless warning — safe to ignore.

---

### 2.3 Windows

#### `just`

| Method | Command | Notes |
|---|---|---|
| **winget (preferred)** | `winget install --id Casey.Just -e` | Built into Windows 10 1809+/11 |
| Scoop | `scoop install just` | Run `scoop install git` first if Scoop isn't set up yet |
| Chocolatey | `choco install just` | Requires an elevated (Admin) PowerShell |
| Cargo | `cargo install just` | Requires Rust toolchain (`rustup`) |
| Manual | Download the `.zip` from https://github.com/casey/just/releases, extract `just.exe`, add its folder to `PATH` | Use for air-gapped machines |

Verify (new PowerShell or cmd window):

```powershell
just --version
```

#### `gcloud`

| Method | Command | Notes |
|---|---|---|
| **winget (preferred)** | `winget install --id Google.CloudSDK -e` | Runs the official installer under the hood |
| Manual installer | Download `GoogleCloudSDKInstaller.exe` from https://cloud.google.com/sdk/docs/install, run it | GUI installer, offers to add to `PATH` and install Python if needed |
| Scoop (community bucket) | `scoop bucket add extras; scoop install gcloud` | Less commonly maintained; prefer winget/manual for gcloud |

Verify (**open a new terminal window first**):

```powershell
gcloud --version
gcloud auth login
```

Gotchas:
- **Always open a brand-new terminal window** after installing either tool on Windows — `winget`
  and the `.exe` installers update the registry's `PATH`, but only new processes re-read it.
  Restarting your terminal (not just the tab) is usually enough; a full sign-out fixes stragglers.
- The `gcloud` Windows installer bundles its own Python; if you already have Python installed and
  hit `gcloud` errors about missing modules, let the installer use its bundled interpreter rather
  than pointing `CLOUDSDK_PYTHON` at your system Python.
- Corporate/managed devices: winget may be blocked by policy — use the manual `.exe`/`.zip`
  installers instead.
- If using WSL2 for actual dev work, install both tools **inside** the WSL distro too (see the
  Ubuntu/Debian section) — the Windows-side install does not carry over into WSL.

---

## 3. Verification Checklist

Run these after installing, in a **fresh** terminal session:

```bash
# 1. Binaries resolve on PATH
which just    # macOS/Linux; use `where just` on Windows
which gcloud  # macOS/Linux; use `where gcloud` on Windows

# 2. Version output (confirms the binary actually runs)
just --version
gcloud --version

# 3. just can find/parse this repo's justfile
just --list

# 4. gcloud is authenticated and has a project set
gcloud auth list
gcloud config get-value project
```

Expected results:
- `just --list` prints the recipes defined in [`justfile`](../justfile) (e.g. `dev`, `gateway`,
  `web`, `seed`) — see [`JUSTFILE-REFERENCE.md`](./JUSTFILE-REFERENCE.md) for what each does.
- `gcloud auth list` shows at least one `ACTIVE` account. If empty, run `gcloud auth login` (and
  `gcloud auth application-default login` if the gateway service calls GCP APIs locally).
- `gcloud config get-value project` should not print `(unset)` before you deploy — run
  `gcloud config set project <PROJECT_ID>` otherwise.

---

## 4. Troubleshooting

**`command not found: just` / `'just' is not recognized` right after install**
The install put the binary somewhere not yet on your current shell's `PATH`. Open a brand-new
terminal window (not just a new tab in some setups) — most install scripts and package managers
only update rc files or the registry, which existing processes don't re-read. If it still fails,
find the binary (`find / -name just -type f 2>/dev/null` on Linux/macOS, or check
`~/.cargo/bin`, `~/.local/bin`, `/opt/homebrew/bin`) and add its directory to `PATH` manually.

**`gcloud` installed but not found after Homebrew cask install**
The cask doesn't always symlink into `/opt/homebrew/bin`. Source the path script it ships:
```bash
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"
```
Add that line to `~/.zshrc` (or `~/.bash_profile`) so it persists across sessions.

**`just` version installed is too old (missing a recipe feature)**
Distro package managers (especially Ubuntu LTS, older Fedora) often lag behind upstream. Use the
official install script instead — it always fetches the latest release:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin
```

**`gcloud init` / `gcloud auth login` hangs or can't open a browser**
Common on headless servers, SSH sessions, and WSL without a browser handoff configured. Use:
```bash
gcloud auth login --no-launch-browser
```
This prints a URL to open on any machine with a browser, and a code to paste back.

**Permission denied writing to install directory**
On Linux/macOS, `sudo`-installed package manager binaries (apt/dnf/pacman) go to system
directories and need `sudo` for the install step only — never run `just`/`gcloud` themselves with
`sudo`. For user-space installs (`~/.local/bin`, `~/.cargo/bin`), ensure the directory exists and
is owned by your user: `mkdir -p ~/.local/bin`.

**Corporate proxy/firewall blocks the install script or `packages.cloud.google.com`**
Use the manual `.tar.gz`/`.zip` downloads listed in each platform's table above instead of
`curl | bash` one-liners, and set `HTTPS_PROXY`/`HTTP_PROXY` env vars before running installers
that need network access.

**Multiple Python versions confuse `gcloud` (Windows/Linux)**
Unset `CLOUDSDK_PYTHON` and let `gcloud` use its bundled/auto-detected interpreter, or explicitly
set `CLOUDSDK_PYTHON` to a known-good Python 3.9–3.12 executable:
```bash
gcloud config get-value core/custom_ca_certs_file  # sanity check gcloud still runs
export CLOUDSDK_PYTHON=/usr/bin/python3
```

**`just` recipes fail with "recipe requires ..." even though the tool is installed**
That's usually a missing *dependency the justfile shells out to* (Node, Docker), not a `just`
install problem. Check [`JUSTFILE-REFERENCE.md`](./JUSTFILE-REFERENCE.md) and
[`deployment.md`](./deployment.md) for this repo's actual prerequisites.
