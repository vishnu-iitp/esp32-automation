# Custom MAC Address Configuration

## Overview
The ESP32 Home Automation System now uses a custom MAC address instead of the hardware MAC address for device identification. This allows you to:

1. **Create predictable device identifiers**: No more random MAC addresses
2. **Manage multiple devices easily**: Each device can have a unique, memorable identifier
3. **Maintain compatibility**: Works seamlessly with existing Supabase edge functions

## Configuration

### Setting Your Custom MAC Address

In `HomeAutomationESP32.ino`, locate this line in the configuration section:

```cpp
// Custom MAC Address Configuration (modify this to create unique device identifiers)
const char* CUSTOM_MAC_ADDRESS = "AA:BB:CC:DD:EE:FF";
```

**Replace `"AA:BB:CC:DD:EE:FF"` with your desired MAC address.**

### MAC Address Format
- Must follow standard MAC address format: `XX:XX:XX:XX:XX:XX`
- Use hexadecimal characters (0-9, A-F)
- Each device must have a unique MAC address

### Example MAC Addresses
```cpp
// Kitchen Device
const char* CUSTOM_MAC_ADDRESS = "DE:AD:BE:EF:01:01";

// Living Room Device  
const char* CUSTOM_MAC_ADDRESS = "DE:AD:BE:EF:01:02";

// Bedroom Device
const char* CUSTOM_MAC_ADDRESS = "DE:AD:BE:EF:01:03";
```

## Important Notes

1. **Unique Identifiers**: Each ESP32 device must have a unique custom MAC address
2. **Edge Function Compatibility**: The Supabase edge functions remain unchanged and work automatically
3. **Database Records**: Once a device is registered with a custom MAC, changing it will create a new device entry
4. **Hardware MAC**: The original hardware MAC is still available via `getMacAddress()` function for debugging

## Benefits

- **Predictable Device Management**: You control the device identifiers
- **Easy Identification**: Use meaningful MAC patterns for different rooms/areas
- **Simplified Deployment**: No need to check what MAC each ESP32 generated
- **Better Organization**: Group devices by MAC address patterns

## Migration from Hardware MAC

If you have existing devices using hardware MAC addresses:

1. Note down the current hardware MAC addresses from your Supabase database
2. Update the `CUSTOM_MAC_ADDRESS` to match the existing hardware MAC
3. Or create new custom MAC addresses and re-claim the devices

## Troubleshooting

- **Device not appearing**: Ensure the custom MAC address is unique and properly formatted
- **Multiple devices with same MAC**: Each device must have a different custom MAC address
- **Can't find device**: Check the Supabase database for the exact MAC address format used
