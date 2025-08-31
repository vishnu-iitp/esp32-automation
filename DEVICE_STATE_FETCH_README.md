# ESP32 Device State Fetch Function Deployment

## Overview
This document explains the new functionality added to fetch and set initial device states when the ESP32 starts up.

## What was implemented:

### 1. New Supabase Edge Function: `get-device-states`
- **Location**: `supabase/functions/get-device-states/index.ts`
- **Purpose**: Returns all device states for a specific MAC address
- **Usage**: Called by ESP32 at startup to get current device states

### 2. Updated ESP32 Code
- **File**: `HomeAutomationESP32/HomeAutomationESP32.ino`
- **New function**: `fetchAndSetInitialDeviceStates()`
- **Integration**: Called during `setupClaimedDevice()` before WebSocket connection

## How it works:

1. **ESP32 Startup**: When a claimed ESP32 boots up, it calls the new edge function
2. **State Fetch**: The function returns all devices and their current states for that ESP32
3. **GPIO Setup**: ESP32 sets all GPIO pins to match the stored states
4. **WebSocket Connect**: Normal real-time operation continues

## Benefits:

- **State Consistency**: Devices maintain their last known state after ESP32 reboot
- **User Experience**: No need to manually reset device states after power outage
- **Reliability**: System recovers gracefully from ESP32 restarts

## Deployment Instructions:

### Step 1: Deploy the Edge Function
```bash
# Navigate to your project directory
cd c:\Users\vishnu\Documents\automation\supabase_frontend\esp32-automation

# Deploy the new edge function
supabase functions deploy get-device-states

# Or deploy all functions
supabase functions deploy
```

### Step 2: Upload ESP32 Code
1. Open Arduino IDE
2. Load the updated `HomeAutomationESP32.ino` file
3. Compile and upload to your ESP32

### Step 3: Test the Functionality
1. Set some devices to ON state using your web interface
2. Power off the ESP32
3. Power on the ESP32
4. Check that devices maintain their previous states

## API Reference:

### Request to `get-device-states`
```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF"
}
```

### Response
```json
{
  "success": true,
  "claimed": true,
  "device_count": 3,
  "devices": [
    {
      "id": 1,
      "name": "Living Room Light",
      "gpio": 23,
      "state": 1,
      "device_type": "light"
    },
    {
      "id": 2,
      "name": "Kitchen Fan",
      "gpio": 22,
      "state": 0,
      "device_type": "fan"
    }
  ]
}
```

## Error Handling:

- **Device Not Found**: Returns 404 if MAC address doesn't exist
- **Unclaimed Device**: Returns success with `claimed: false`
- **No Devices**: Returns empty devices array
- **Network Error**: ESP32 continues with default OFF state for all pins

## Notes:

- The function uses the service role key to bypass RLS policies
- Only claimed devices will have their states fetched
- GPIO pins are initialized on-demand during state setting
- The system is backward compatible with existing unclaimed devices
