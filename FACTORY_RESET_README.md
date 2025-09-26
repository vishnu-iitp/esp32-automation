# Factory Reset Feature Implementation Guide

## Overview

The Factory Reset feature allows devices to be easily reset from a "claimed" state back to an "unclaimed" state. This is particularly useful in retail environments where devices need to be demonstrated and then reset for new customers.

## How It Works

### Button Press Behavior
- **Short press (< 5 seconds)**: No action, button release message shown
- **Medium press (5-10 seconds)**: WiFi settings reset only (existing functionality)
- **Long press (≥ 10 seconds)**: Factory reset triggered (NEW functionality)

### Factory Reset Process
1. ESP32 calls the `factory-reset-device` Supabase Edge Function
2. The function removes the device's `user_id` from the `devices` table
3. The function re-adds the device to the `unclaimed_devices` table
4. ESP32 updates its local EEPROM to mark itself as unclaimed
5. ESP32 resets WiFi settings and restarts

## Files Modified/Created

### New Supabase Edge Function
- **File**: `supabase/functions/factory-reset-device/index.ts`
- **Purpose**: Handles the server-side factory reset logic
- **Endpoint**: `https://[PROJECT_ID].supabase.co/functions/v1/factory-reset-device`

### Modified ESP32 Firmware
- **File**: `HomeAutomationESP32/HomeAutomationESP32.ino`
- **Changes**:
  - Added `FACTORY_RESET_HOLD_TIME` constant (10 seconds)
  - Added `triggerFactoryReset()` function declaration
  - Enhanced `checkResetButton()` function to support 3-tier button behavior
  - Added `triggerFactoryReset()` function implementation

### Deployment Scripts
- **PowerShell**: `deploy-factory-reset-function.ps1`
- **Batch**: `deploy-factory-reset-function.bat`

## Deployment Instructions

### 1. Deploy the Supabase Function

#### Using PowerShell:
```powershell
.\deploy-factory-reset-function.ps1
```

#### Using Command Prompt:
```cmd
deploy-factory-reset-function.bat
```

#### Manual Deployment:
```bash
supabase functions deploy factory-reset-device
```

### 2. Upload Updated ESP32 Firmware
1. Open `HomeAutomationESP32/HomeAutomationESP32.ino` in Arduino IDE
2. Ensure all libraries are installed (WiFi, ArduinoJson, WebSocketsClient, HTTPClient, EEPROM)
3. Update the board and port settings
4. Upload the firmware to your ESP32 devices

## Usage Scenarios

### For Shopkeepers (Demonstration Mode)
1. **Initial Setup**: Power on a new/reset device
2. **WiFi Connection**: Connect device to store WiFi via WiFiManager portal
3. **Device Claiming**: Use your account to claim the device for demonstration
4. **Customer Demo**: Show features to potential customers
5. **Factory Reset**: Hold reset button for 10 seconds when ready to sell
6. **Verification**: Device should restart and be ready for new customer

### For Customers (After Purchase)
1. **Power On**: Device starts in unclaimed mode
2. **WiFi Setup**: Connect to home WiFi via WiFiManager portal
3. **Account Creation**: Create account in your app
4. **Device Claiming**: Use "Claim Device" feature with device MAC address
5. **Permanent Setup**: Device is now permanently linked to customer account

## Testing the Feature

### Test Factory Reset
1. **Claim a device** using your app
2. **Verify claimed status** in Supabase dashboard (`devices` table should show your `user_id`)
3. **Hold reset button** on ESP32 for 10+ seconds
4. **Check serial output** for "!!! FACTORY RESET TRIGGERED !!!" message
5. **Verify database reset** - device should be back in `unclaimed_devices` table
6. **Confirm device restart** - device should restart automatically

### Expected Serial Output
```
Reset button pressed...
!!! FACTORY RESET TRIGGERED !!!
Device successfully reset in the database.
[WiFi reset and device restart follows]
```

## Troubleshooting

### Common Issues

#### Function Deployment Fails
- **Check**: Supabase CLI is installed and logged in
- **Solution**: Run `supabase login` and try again

#### ESP32 HTTP Error During Factory Reset
- **Check**: Device has internet connectivity
- **Check**: Supabase project ID and anon key are correct
- **Solution**: Verify credentials and network connection

#### Factory Reset Doesn't Update Database
- **Check**: Supabase function logs for errors
- **Check**: Device MAC address format matches database entries
- **Solution**: Ensure MAC addresses are consistently formatted (uppercase)

#### Device Doesn't Restart After Factory Reset
- **Check**: Serial output for error messages
- **Solution**: The device should restart automatically via `wifiManager.resetWiFiSettings()`

### Debug Steps
1. **Monitor Serial Output**: Keep serial monitor open during testing
2. **Check Supabase Logs**: Use Supabase dashboard to view function execution logs
3. **Verify Database State**: Check both `devices` and `unclaimed_devices` tables
4. **Test Network Connectivity**: Ensure ESP32 can reach internet

## Security Considerations

- The factory reset function uses the service role key server-side for full database access
- Only the device itself can trigger its own factory reset
- MAC address validation ensures only legitimate devices can be reset
- The function doesn't expose sensitive user information

## Future Enhancements

- **LED Indicators**: Add visual feedback during button press timing
- **Audio Feedback**: Implement buzzer sounds for different reset modes
- **Admin Override**: Add web-based factory reset capability
- **Batch Reset**: Allow multiple devices to be reset simultaneously
- **Reset Confirmation**: Add double-confirmation for factory reset

## Support

If you encounter issues with the Factory Reset feature:
1. Check the troubleshooting section above
2. Review serial output logs
3. Verify Supabase function deployment
4. Ensure firmware is properly uploaded to all devices

The Factory Reset feature makes your home automation system much more retail-friendly and user-friendly for device handover scenarios.
