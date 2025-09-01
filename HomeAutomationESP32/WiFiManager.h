/*
 * Modern WiFi Manager for ESP32 Home Automation
 * Features:
 * - Captive Portal with modern UI
 * - WiFi network scanning
 * - Secure credential storage
 * - Firmware update capability
 * - No device information leakage
 */

#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <EEPROM.h>

class ModernWiFiManager {
private:
    WebServer server;
    DNSServer dnsServer;
    
    // EEPROM addresses for WiFi credentials
    static const int WIFI_SSID_ADDR = 100;
    static const int WIFI_PASS_ADDR = 200;
    static const int WIFI_CONFIGURED_ADDR = 300;
    static const int MAX_SSID_LENGTH = 32;
    static const int MAX_PASS_LENGTH = 64;
    
    // AP configuration
    const char* AP_SSID = "SmartHome-Setup";
    const char* AP_PASSWORD = "";  // Open network for easier connection
    const IPAddress AP_IP = IPAddress(192, 168, 4, 1);
    const IPAddress AP_GATEWAY = IPAddress(192, 168, 4, 1);
    const IPAddress AP_SUBNET = IPAddress(255, 255, 255, 0);
    
    bool isConfigMode = false;
    unsigned long configModeStartTime = 0;
    static const unsigned long CONFIG_MODE_TIMEOUT = 300000; // 5 minutes
    
    void startConfigMode();
    void handleRoot();
    void handleWiFiScan();
    void handleWiFiConnect();
    void handleNotFound();
    void saveWiFiCredentials(const String& ssid, const String& password);
    bool loadWiFiCredentials(String& ssid, String& password);
    void clearWiFiCredentials();
    bool isWiFiConfigured();
    String getModernHTML();
    String getWiFiScanResults();
    
public:
    ModernWiFiManager();
    void begin();
    bool connectToWiFi();
    void handleClient();
    bool isInConfigMode();
    void resetWiFiSettings();
};

#endif
