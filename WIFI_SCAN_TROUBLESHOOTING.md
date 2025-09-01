# WiFi Scanning Troubleshooting Guide

## Issue: "Error scanning WiFi networks"

This error can occur due to several reasons. Here's how to diagnose and fix it:

## Quick Fixes

### 1. **Restart the Device**
- Power off the ESP32 completely
- Wait 5 seconds
- Power it back on
- Look for "SmartHome-Setup" network again

### 2. **Check Serial Monitor**
- Open Arduino IDE Serial Monitor (Tools > Serial Monitor)
- Set baud rate to 115200
- Look for error messages during WiFi scan

### 3. **Test Connection**
- Connect to "SmartHome-Setup" network
- Open browser to `http://192.168.4.1`
- Click "Test Connection" button
- Click "Debug Info" to see device status

## Common Causes & Solutions

### **Cause 1: WiFi Hardware Issue**
**Symptoms:** Scan fails immediately
**Solution:** 
```cpp
// Check if this appears in serial monitor:
// "WiFi scan failed" or "No networks found"
```
- Try different ESP32 board
- Check antenna connection

### **Cause 2: Memory Issues**
**Symptoms:** Device restarts during scan
**Solution:**
- Visit `/debug` page to check free heap
- If heap < 50KB, there might be memory leak

### **Cause 3: WiFi Mode Conflicts**
**Symptoms:** Scan works sometimes, fails other times
**Solution:** Already implemented in the fixed code
- Uses AP+STA mode during scan
- Properly restores AP mode after scan

### **Cause 4: Network Interference**
**Symptoms:** Some networks visible, others not
**Solution:**
- Move ESP32 closer to router
- Try in different location
- Check for 2.4GHz vs 5GHz (ESP32 only supports 2.4GHz)

## Debugging Steps

### Step 1: Check Device Status
1. Connect to "SmartHome-Setup"
2. Go to `http://192.168.4.1/debug`
3. Check output:
   - WiFi Mode should be "1" (AP mode)
   - Free Heap should be > 50000
   - AP Status should show connected clients

### Step 2: Manual Network Test
1. Use phone's WiFi scanner
2. Note which 2.4GHz networks are visible
3. Compare with ESP32 scan results
4. ESP32 should see similar networks

### Step 3: Serial Monitor Analysis
Look for these messages:
```
✅ Good: "Starting WiFi scan..."
✅ Good: "Scan completed. Networks found: X"
❌ Bad: "WiFi scan failed"
❌ Bad: "Guru Meditation Error"
```

### Step 4: Browser Console
1. Open browser developer tools (F12)
2. Check Console tab for JavaScript errors
3. Look for network errors in Network tab

## Manual Testing

If the automatic scan fails, you can manually test:

### Test 1: Direct Network Access
```
http://192.168.4.1/scan
```
Should return JSON with network list

### Test 2: Status Check
```
http://192.168.4.1/status
```
Should return: `{"status":"ready","mode":"config"}`

## Code Improvements Made

The updated WiFiManager now includes:

1. **Better Error Handling**
   - Try-catch blocks around scan operations
   - Detailed error messages
   - Memory cleanup after scan

2. **Improved WiFi Mode Management**
   - Uses AP+STA mode during scan
   - Properly restores AP mode
   - Restarts DNS server if needed

3. **Enhanced Debugging**
   - Debug endpoint for device status
   - Detailed console logging
   - Connection test functionality

4. **Robust Scanning**
   - Clears scan results to free memory
   - Handles network not found scenarios
   - Better timeout handling

## If Nothing Works

1. **Flash Fresh Firmware**
   - Upload the updated code
   - Ensure all libraries are correct versions

2. **Hardware Check**
   - Try different ESP32 board
   - Check power supply (minimum 500mA)
   - Verify antenna connection

3. **Network Environment**
   - Test in area with fewer WiFi networks
   - Use phone hotspot for testing
   - Check for WiFi signal strength

The improved code should resolve most scanning issues. If problems persist, use the debug endpoints to identify the specific cause.
