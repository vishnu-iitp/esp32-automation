# Device Management Guide

## Overview
This guide explains the new "Add Device" and "Rename Device" features added to the ESP32 Home Automation system.

## New Features

### 1. Add Device Feature
Allows users to dynamically add new devices to the system through the web interface.

#### How to Use:
1. Click the "Add Device" button on the main page
2. Fill in the device details:
   - **Device Name**: Enter a descriptive name (e.g., "Kitchen Light")
   - **GPIO Pin**: Select an available GPIO pin (1-39)
   - **Device Type**: Choose from Light, Fan, Outlet, Motor, Heater, or Cooler
3. Click "Add Device" to save

#### Features:
- Real-time validation to prevent duplicate GPIO usage
- Automatic device card creation in the UI
- ESP32 automatically configures the new GPIO pin
- Device starts in OFF state by default

### 2. Rename Device Feature
Allows users to rename existing devices.

#### How to Use:
1. Click the edit icon (✏️) on any device card
2. Enter the new device name
3. Click "Save Changes"

#### Features:
- Real-time UI updates
- Changes are synchronized with the database
- ESP32 logs the rename operation

## Technical Implementation

### Web Interface Changes

#### New JavaScript Functions:
- `openAddDeviceModal()` - Opens the add device dialog
- `addDevice()` - Validates input and creates new device in database
- `openRenameDeviceModal(deviceId)` - Opens rename dialog for specific device
- `renameDevice()` - Updates device name in database
- `handleDeviceInsert(newDevice)` - Handles real-time INSERT events

#### New Event Listeners:
- Add Device button click handler
- Edit device button click handler (using event delegation)
- Modal close handlers for both modals

#### Enhanced Device Cards:
- Added edit button to each device card
- Improved layout with device actions section
- Support for additional device types (motor, heater, cooler)

### ESP32 Firmware Changes

#### Enhanced Supabase Subscription:
```cpp
// Now subscribes to both UPDATE and INSERT events
doc["payload"]["config"]["postgres_changes"][0]["event"] = "UPDATE";
doc["payload"]["config"]["postgres_changes"][1]["event"] = "INSERT";
```

#### Dynamic GPIO Initialization:
- New `initializeGPIO(int gpio)` function
- Tracks initialized pins with `initializedPins[]` array
- Automatically configures new GPIO pins when devices are added

#### Enhanced Message Handling:
- Detects INSERT vs UPDATE events
- Logs device additions with name and GPIO
- Logs rename operations
- Improved error handling for invalid GPIO pins

## Database Schema Requirements

The Supabase `devices` table should have these columns:
- `id` (int, primary key, auto-increment)
- `name` (text, device name)
- `gpio` (int, GPIO pin number)
- `state` (int, 0 or 1 for OFF/ON)
- `device_type` (text, optional, for UI categorization)
- `created_at` (timestamp)
- `updated_at` (timestamp)

## Validation Rules

### Add Device Validation:
- Device name cannot be empty
- GPIO pin must be between 1-39
- GPIO pin cannot be already in use
- All fields are required

### Rename Device Validation:
- New name cannot be empty
- Device must exist in the system

## Error Handling

### Common Error Messages:
- "Please enter a device name"
- "Please enter a valid GPIO pin (1-39)"
- "GPIO X is already in use by 'Device Name'"
- "Failed to add device. Please try again."
- "Device not found"
- "Failed to rename device. Please try again."

### ESP32 Error Handling:
- Invalid GPIO pins are logged but don't crash the system
- Automatic GPIO initialization prevents control errors
- Connection errors trigger automatic reconnection

## Real-time Features

### Web Interface:
- New devices appear instantly without page refresh
- Device renames update immediately in the UI
- Toast notifications for all operations

### ESP32:
- Receives INSERT events for new devices
- Automatically configures GPIO pins for new devices
- Logs all device operations to Serial monitor

## Testing Checklist

### Add Device Feature:
- [ ] Add device with valid name and GPIO
- [ ] Try to add device with empty name (should fail)
- [ ] Try to add device with duplicate GPIO (should fail)
- [ ] Verify ESP32 logs new device addition
- [ ] Verify GPIO pin works for new device

### Rename Device Feature:
- [ ] Rename device with valid name
- [ ] Try to rename with empty name (should fail)
- [ ] Verify UI updates immediately
- [ ] Verify ESP32 logs rename operation

### Real-time Synchronization:
- [ ] Multiple browsers show same changes
- [ ] ESP32 receives all events correctly
- [ ] No phantom devices or missing devices

## Troubleshooting

### Device Not Appearing:
1. Check Supabase connection
2. Verify database permissions
3. Check browser console for errors
4. Ensure Supabase real-time is enabled

### ESP32 Not Responding to New Device:
1. Check Serial monitor for connection status
2. Verify GPIO pin is valid for your ESP32 model
3. Ensure WebSocket connection is active
4. Check if GPIO is already in use by another component

### UI Not Updating:
1. Refresh the page
2. Check Supabase real-time configuration
3. Verify browser supports WebSockets
4. Check for JavaScript errors in console

## Security Considerations

- Validate all user inputs on both client and server side
- Use Supabase Row Level Security (RLS) for database access
- Sanitize device names to prevent XSS attacks
- Implement rate limiting for device operations

## Future Enhancements

Possible future features:
- Delete device functionality
- Device grouping/rooms
- Device scheduling
- Power monitoring
- Device status history
- Bulk device operations
