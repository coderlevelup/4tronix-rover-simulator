# Rover Server

The rover server is a queue-based REST API that processes instructions for the rover. It can run in mock mode (for development) or connect to real hardware on a Raspberry Pi.

## Hardware Assembly

If you're setting up a new M.A.R.S. Rover from scratch:

- [Assembly Instructions](https://4tronix.co.uk/blog/?p=2112) - Step-by-step build guide
- [Assembly Video](https://www.youtube.com/watch?v=Np8ZQQd85oc) - Video walkthrough

## Known-Working Pi Configuration (as of March 2026)

This is the verified working setup inspected directly from the Pi on 22 March 2026.

### OS
- **Raspbian GNU/Linux 11 (Bullseye)**, image dated **22 October 2024**
- Python **3.9.2**
- Hostname: `marspi`
- Timezone: `Africa/Johannesburg` (SAST)

### Hardware Interfaces
- **SPI:** enabled (`/dev/spidev0.0`, `/dev/spidev0.1`)
- **I2C:** enabled (`/dev/i2c-1`)
- **Camera:** enabled (`start_x=1` in config.txt)
- **GPU memory:** 128MB

### WiFi Networks Configured
- `marsyard` (password: `curiousinternet`)
- `mars-relay-network`
- `David's Note 10` (personal hotspot, hashed PSK)

### Key Python Packages
- `Flask 1.1.2`
- `RPi.GPIO 0.7.0`
- `rpi-ws281x 5.0.0`
- `picamera 1.13` / `picamera2 0.3.12`
- `adafruit-circuitpython-pca9685 3.4.20`
- `pigpio 1.78`
- `numpy 1.19.5`

### Auto-start Service
`rover-server.service` is enabled and starts on boot:
- Runs as `root`
- Working dir: `/home/mars/4tronix-rover-simulator/real-rover`
- Starts: `/usr/bin/python3 /home/mars/4tronix-rover-simulator/real-rover/rover_server.py`

### Git Repos on Pi
- `/home/mars/4tronix-rover-simulator` — main repo
- `/home/mars/4tronix-rover-simulator-changed` — experimental branch with camera streaming

### 4tronix Rover Files
Located at `/home/mars/marsrover/`, installed via the official `rover.sh` script:
`calibrateServos.py`, `rover.py`, `motorTest.py`, `servoTest.py`, `sonarTest.py`, etc.

### SSH Access
- User: `mars`, password: `R0v3r!`
- Connect: `ssh mars@marspi.local`
- VNC also enabled (`vncserver-x11-serviced.service`)

---

## Pi Setup (New SD Card)

Follow the [4tronix Pi Setup Guide](https://4tronix.co.uk/blog/?p=2409) for full details.

### 1. Image the SD Card

Use **Raspberry Pi OS (Legacy, 32-bit) Bullseye, dated 22 October 2024**.

> **Note:** Raspberry Pi Imager no longer lists Bullseye. Download the image directly and use **"Use custom"** in the imager.

**Recommended — Lite** (faster boot, better battery, headless only):
```
https://downloads.raspberrypi.com/raspios_oldstable_lite_armhf/images/raspios_oldstable_lite_armhf-2024-10-28/2024-10-22-raspios-bullseye-armhf-lite.img.xz
```

**Full desktop** (larger, slower, but all Pimoroni/hardware libraries pre-installed):
```
https://downloads.raspberrypi.com/raspios_oldstable_armhf/images/raspios_oldstable_armhf-2024-10-28/2024-10-22-raspios-bullseye-armhf.img.xz
```

In Raspberry Pi Imager:
1. Click **Choose OS**
2. Select **Use custom** and pick the downloaded `.img.xz` file
3. Choose your SD card and write

> **Important:** The OS Customisation screen (gear icon) does **not** work with custom images. Skip it — configure headless setup manually after writing as described below.

After imaging, macOS will show "disk not readable" - click **Ignore** (not Eject or Initialize). The boot partition will mount as `/Volumes/bootfs`.

### 2. Headless Setup

Configure the SD card for headless boot before inserting it into the Pi.

> **macOS Note:** If you get "Operation not permitted" errors, add Terminal to **System Settings → Privacy & Security → Full Disk Access**, then restart Terminal.

> **Important:** `userconf.txt` is only processed once on first boot. If first boot fails to create the user, you must reflash — putting the file back after the fact does not work.

#### Required Files

Create these files on the `bootfs` partition:

**Enable SSH** - Create an empty file named `ssh`:
```bash
touch /Volumes/bootfs/ssh
```

**Configure WiFi** - Create `wpa_supplicant.conf`:
```bash
cat > /Volumes/bootfs/wpa_supplicant.conf << 'EOF'
country=ZA
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="marsyard"
    psk="curiousinternet"
    key_mgmt=WPA-PSK
}

network={
    ssid="mars-relay-network"
    psk="E.T.PhoneHome*"
    key_mgmt=WPA-PSK
}
EOF
```

**Create mars user** - Generate a fresh hash and write `userconf.txt`. Always generate a fresh hash rather than copying one from docs, as stale hashes can fail silently:
```bash
HASH=$(openssl passwd -6 'R0v3r!')
python3 -c "open('/Volumes/bootfs/userconf.txt','w').write('mars:' + '$HASH' + '\n')"
```

Verify it looks right:
```bash
cat /Volumes/bootfs/userconf.txt
```

It should show a single line: `mars:$6$...` with no backslashes.

**Old (do not use):**
```
pi:$6$rBoByrWRKMY1EHFy$ho.LISnfm83CLBWBE/yqJ6Lq1TinRlxw/ImMTPcvvMuUfhQYcMmFnpFXUPowjy4SLJQK45iX9.
```

This sets user `pi` with password `raspberry`.

> **macOS:** Neither `echo >` nor `sudo tee` work due to macOS security restrictions on FAT32 volumes. Generate a fresh hash and write the file:
> ```bash
> # Generate hash (use the output in the next command)
> openssl passwd -6 raspberry
>
> # Write userconf.txt with the generated hash
> python3 -c "open('/Volumes/bootfs/userconf.txt','w').write('pi:<paste-hash>\n')"
> ```
> Or open in Finder and create the file manually: `open /Volumes/bootfs`

> **Custom password:** To generate a hash for a different password:
> ```bash
> echo 'mypassword' | openssl passwd -6 -stdin
> ```
> Then format as `pi:<hash>` in userconf.txt.

#### Automated First-Boot Setup (Optional)

To automatically configure the Pi on first boot, create these additional files:

**First-run script** - Create `firstrun.sh`:
```bash
cat > /Volumes/bootfs/firstrun.sh << 'FIRSTRUN'
#!/bin/bash
set +e

LOG=/boot/firstrun.log
exec > >(tee -a $LOG) 2>&1

echo "=== marspi firstrun starting at $(date) ==="

# Set hostname
raspi-config nonint do_hostname marspi

# Enable SPI
raspi-config nonint do_spi 0

# Enable I2C
raspi-config nonint do_i2c 0

# Set timezone
raspi-config nonint do_change_timezone Africa/Johannesburg

# Copy setup service for post-network tasks
cp /boot/marspi-setup.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable marspi-setup.service

# Remove firstrun from cmdline.txt
sed -i 's| systemd.run.*||g' /boot/cmdline.txt

echo "=== firstrun complete, rebooting ==="

rm -f /boot/firstrun.sh
reboot
FIRSTRUN
```

**Post-network setup service** - Create `marspi-setup.service`:
```bash
cat > /Volumes/bootfs/marspi-setup.service << 'EOF'
[Unit]
Description=Mars Rover Pi Setup
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash /boot/marspi-setup.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
```

**Post-network setup script** - Create `marspi-setup.sh`:
```bash
cat > /Volumes/bootfs/marspi-setup.sh << 'SETUP'
#!/bin/bash
# Runs after network is available

LOG=/boot/marspi-setup.log
exec > >(tee -a $LOG) 2>&1

echo "=== marspi setup starting at $(date) ==="

# Update and install dependencies
echo "Updating packages..."
apt-get update

echo "Installing rpi_ws281x..."
pip install rpi_ws281x

# Install 4tronix rover software
echo "Installing 4tronix rover software..."
cd /home/pi
wget -q https://4tronix.co.uk/rover.sh -O rover.sh
bash rover.sh

# Remove this script from running again
echo "Removing setup service..."
systemctl disable marspi-setup.service
rm /etc/systemd/system/marspi-setup.service

echo "=== marspi setup complete at $(date) ==="
echo "Rebooting in 5 seconds..."
sleep 5
reboot
SETUP
```

**Modify cmdline.txt** - Add the firstrun trigger:
```bash
# Read current cmdline.txt
CMDLINE=$(cat /Volumes/bootfs/cmdline.txt)

# Append firstrun parameters (must be single line)
echo "${CMDLINE} systemd.run=/boot/firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target" > /Volumes/bootfs/cmdline.txt
```

#### Eject and Boot

```bash
diskutil eject /dev/disk4  # Use correct disk number
```

Insert the SD card into the Pi and power on. The automated setup will:

1. **First boot:** Set hostname, enable SPI/I2C, set timezone, reboot
2. **Second boot:** Install rpi_ws281x, download 4tronix software, reboot
3. **Ready:** Connect via `ssh pi@marspi.local` (password: `raspberry`)

Check logs at `/boot/firstrun.log` and `/boot/marspi-setup.log` for any errors.

### 3. Manual Setup (If Not Using Automation)

If you didn't use the automated scripts, after first boot run:

```bash
sudo raspi-config
```

- **System Options → Hostname**: Set to `marspi`
- **Interface Options → SPI**: Enable
- **Interface Options → I2C**: Enable
- Reboot when prompted

Then install rover software:
```bash
sudo pip install rpi_ws281x
wget https://4tronix.co.uk/rover.sh -O rover.sh
bash rover.sh
```

### 4. Symlink driveRover.py

The 4tronix `rover.sh` installs an older `driveRover.py`. Replace it with a symlink to the repo version so it stays up to date:

```bash
rm ~/marsrover/driveRover.py
ln -s ~/4tronix-rover-simulator/driveRover.py ~/marsrover/driveRover.py
```

### 5. Calibrate Servos

Before first use, calibrate the wheel servos:
```bash
cd ~/marsrover
sudo python calibrateServos.py
```

This ensures all wheels point straight when centered.

> **Note:** Motor and servo test programs must run in a terminal (like LXTerminal), not in an IDE.

## First Time Setup (Yard Server)

Before you can run the server, you'll need to set up a Python environment and install some libraries. Don't worry - you only need to do this once on each computer.

1. Open a terminal window and navigate to the yard folder:

```bash
cd yard
```

2. Create a Python virtual environment. This is a special folder that keeps all the libraries this project needs separate from other Python projects:

```bash
python -m venv venv
```

3. Activate the environment. This tells your terminal to use the libraries in this virtual environment:

```bash
source venv/bin/activate
```

You should see `(venv)` appear at the start of your terminal prompt. This means the environment is active.

4. Install the required libraries:

```bash
pip install -r rover/requirements.txt
```

You might see some warnings - that's usually fine. As long as it doesn't show any errors in red, you're good to go.

## Running the Server

Once you've done the setup, you can run the server like this:

1. Make sure you're in the yard folder and your virtual environment is activated (you should see `(venv)` in your prompt)

2. Start the rover server:

```bash
cd rover
python rover_server.py
```

You should see a message like:
```
Using MockRoverDriver (not on Pi)
Queue processor started
Starting rover server on port 8523...
```

The "MockRoverDriver" message means it's running in simulator mode - perfect for development!

## Sending Commands

With the server running, you can send commands to the rover. Open a new terminal window and try this:

```bash
curl -X POST http://localhost:8523/queue/add \
  -H "Content-Type: application/json" \
  -d '[{"cmd": "forward", "params": {"speed": 60, "seconds": 2}}]'
```

This tells the rover to move forward at speed 60 for 2 seconds. Back in your server window, you should see:
```
[MOCK] Forward at speed 60
[MOCK] Stop
```

You can also check what the rover is doing:
```bash
curl http://localhost:8523/queue/status
```

And if you ever need to stop the rover immediately:
```bash
curl -X POST http://localhost:8523/queue/clear
```

## Available Commands

Here are all the commands you can send to the rover:

| Command | What it does | Parameters |
|---------|--------------|------------|
| `forward` | Move forward | `speed` (0-100), `seconds` |
| `backward` | Move backward | `speed` (0-100), `seconds` |
| `spin_left` | Spin left on the spot | `speed` (0-100), `seconds` |
| `spin_right` | Spin right on the spot | `speed` (0-100), `seconds` |
| `steer_left` | Steer left while moving | `degrees` (5-45), `speed`, `seconds` |
| `steer_right` | Steer right while moving | `degrees` (5-45), `speed`, `seconds` |
| `stop` | Stop immediately | (none) |
| `wait` | Pause without moving | `seconds` |

## Running the Tests

If you want to make sure everything is working correctly, you can run the test suite:

```bash
cd rover
python -m pytest -v
```

This runs 52 tests that check all the different parts of the server. If you see all green checkmarks, everything is working!

## On a Raspberry Pi

When running on a Raspberry Pi with the real rover hardware connected, the server automatically detects this and uses the real hardware driver instead of the mock. You'll see:

```
Using RealRoverDriver (Pi detected)
```

The same commands work exactly the same way - the rover will actually move!
