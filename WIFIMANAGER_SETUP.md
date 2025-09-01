# WiFiManager Integration for ESP32 Home Automation

## Overview
The ESP32 Home Automation sketch has been enhanced with WiFiManager to provide captive portal functionality for Wi-Fi configuration. This eliminates the need for hard-coded Wi-Fi credentials and allows users to configure their network settings through a web interface.

## Required Libraries
To compile and run this sketch, you need to install the following libraries in your Arduino IDE:

### 1. WiFiManager Library
**Installation via Arduino IDE:**
1. Open Arduino IDE
2. Go to **Sketch** → **Include Library** → **Manage Libraries**
3. Search for "WiFiManager"
4. Install **"WiFiManager" by tzapu** (latest version)

**Installation via Library Manager:**
- Library Name: WiFiManager
- Author: tzapu
- Repository: https://github.com/tzapu/WiFiManager

### 2. Additional Dependencies
The WiFiManager library automatically handles these dependencies, but ensure they are available:
- **WebServer** (ESP32 core library)
- **DNSServer** (ESP32 core library)
- **WiFi** (ESP32 core library)

## How It Works

### First Boot / No Saved Credentials
1. ESP32 starts and attempts to connect to previously saved Wi-Fi credentials
2. If no credentials exist or connection fails, it creates an Access Point (AP) named **"ESP32-Home-Automation-Setup"**
3. Connect to this AP from your phone/computer
4. A captive portal automatically opens (or navigate to 192.168.4.1)
5. Select your Wi-Fi network and enter the password
6. Click "Save" - the ESP32 will restart and connect to your chosen network
7. Normal home automation functionality begins

### Subsequent Boots
1. ESP32 automatically connects to the saved Wi-Fi network
2. If the saved network is unavailable, it reverts to AP mode for reconfiguration
3. Configuration portal timeout is set to 3 minutes

## Features Added

### WiFiManager Configuration
- **AP Name**: "ESP32-Home-Automation-Setup"
- **AP IP**: 192.168.4.1
- **Portal Timeout**: 3 minutes
- **Auto-restart**: If connection fails after timeout

### Debug Functions
- `resetWiFiSettings()`: Clears saved credentials and restarts (useful for development)

## Usage Instructions

### Normal Operation
1. Power on the ESP32
2. If first boot, connect to "ESP32-Home-Automation-Setup" AP
3. Configure your Wi-Fi through the web portal
4. Device will automatically connect and begin normal operation

### Reconfiguration
If you need to change Wi-Fi settings:
1. Call `resetWiFiSettings()` function (requires code modification for trigger)
2. Or reset the ESP32 when your previous network is unavailable
3. The configuration portal will start automatically

### Troubleshooting

**Portal doesn't open automatically:**
- Manually navigate to 192.168.4.1 in your browser

**Can't connect to saved network:**
- Wait 3 minutes for portal timeout, then reconfigure
- Check if your router settings have changed

**Device keeps restarting:**
- Ensure WiFiManager library is properly installed
- Check serial monitor for error messages

## Code Changes Made

### Removed
- Hard-coded `WIFI_SSID` and `WIFI_PASSWORD` constants

### Added
- WiFiManager library includes
- WiFiManager object instantiation
- Captive portal configuration in setup()
- WiFi reset functionality

### Modified
- WiFi connection logic replaced with WiFiManager.autoConnect()
- Enhanced serial output for debugging

## Serial Monitor Output
When monitoring the device, you'll see output like:
```
=== ESP32 Home Automation (Multi-User Version) ===
Device MAC Address: XX:XX:XX:XX:XX:XX
Device claimed status: UNCLAIMED
GPIO 23 configured as OUTPUT
...
Starting WiFiManager...
WiFi connected successfully!
IP address: 192.168.1.XXX
Setting up unclaimed device - will register and check for claim status...
```

## Security Considerations
- The configuration portal is open (no password) by default
- Consider the WiFiManager documentation for password protection if needed
- The portal only runs when no valid Wi-Fi connection exists

## Compatibility
- Tested with ESP32 DevKit v1
- Compatible with Arduino IDE 1.8.x and 2.x
- Requires ESP32 Arduino Core 2.0.0 or later
